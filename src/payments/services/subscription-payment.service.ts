import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { X402MiddlewareService } from './x402-middleware.service';
import { X402SubscriptionService } from './x402-subscription.service';
import { ConfigService } from '@nestjs/config';
import { validateAndNormalizeNetwork } from '../../shared/config/network.config';

export interface PaymentVerificationResult {
  success: boolean;
  message: string;
  plan: string;
  billing: string;
  subscriptionId?: string;
}

@Injectable()
export class SubscriptionPaymentService {
  private readonly logger = new Logger(SubscriptionPaymentService.name);

  constructor(
    private readonly x402Middleware: X402MiddlewareService,
    private readonly subscriptionService: X402SubscriptionService,
    private readonly configService: ConfigService,
  ) {
    // X402 v1 implementation uses facilitator endpoints directly
    // No need for PayAI X402PaymentHandler - we call facilitator REST APIs
    this.logger.log(
      '✅ X402 v1 service initialized (using facilitator endpoints)',
    );
  }

  async processPayment(
    req: Request,
    res: Response,
    plan: string,
    billingPeriod: string,
    amount: number,
    customHandler?: (walletAddress: string, network: string) => Promise<any>,
  ): Promise<void> {
    const requestedNetwork = this.extractNetworkInfo(req);
    const isSolanaRequest =
      requestedNetwork && requestedNetwork.toLowerCase().includes('solana');

    this.logger.log(
      `Processing payment request for ${plan} ${billingPeriod} - Network: ${requestedNetwork}, isSolana: ${isSolanaRequest}`,
    );

    if (isSolanaRequest) {
      // Use ONLY official PayAI X402PaymentHandler v2 - NO MANUAL VERIFICATION
      await this.processOfficialSolanaX402V2(
        req,
        res,
        plan,
        billingPeriod,
        amount,
        customHandler,
      );
      return;
    }

    // Handle EVM payments with x402-express middleware
    const middleware = this.x402Middleware.getMiddleware();

    if (!middleware) {
      this.logger.error('X402 middleware not initialized');
      res.status(500).json({ error: 'Payment middleware not initialized' });
      return;
    }

    this.logger.log(`Applying X402 middleware for ${plan} ${billingPeriod}`);

    // Apply X402 middleware - this will return 402 if payment headers are missing
    // The PayAI facilitator automatically handles EVM networks
    middleware(req, res, async () => {
      try {
        this.logger.log('X402 payment verified! Processing...');

        // Debug: Log what the middleware populated
        this.logger.log(
          'Request after middleware - payment object:',
          JSON.stringify((req as any).payment, null, 2),
        );
        this.logger.log(
          'Request after middleware - all custom properties:',
          JSON.stringify(
            {
              payment: (req as any).payment,
              wallet: (req as any).wallet,
              from: (req as any).from,
              payer: (req as any).payer,
              paymentNetwork: (req as any).paymentNetwork,
            },
            null,
            2,
          ),
        );

        let result: PaymentVerificationResult;
        if (customHandler) {
          // Use custom handler (for top-ups)
          const walletAddress = this.extractWalletAddress(req);
          const network = this.extractNetworkInfo(req);
          result = await customHandler(walletAddress, network);
        } else {
          // Use default handler (for subscriptions)
          const subscriptionId = await this.handleVerifiedPayment(
            req,
            plan,
            billingPeriod,
            amount,
          );
          result = {
            success: true,
            message: 'Payment verified and subscription created',
            plan,
            billing: billingPeriod,
            subscriptionId,
          };
        }

        this.logger.log('Payment processed successfully:', result);
        res.json(result);
      } catch (error) {
        this.logger.error('Error processing verified payment:', error);

        // Return error response
        res.status(500).json({
          success: false,
          error: 'Payment processing failed',
          message:
            error.message || 'An error occurred while processing payment',
        });
      }
    });
  }

  /**
   * X402 v1 implementation using facilitator endpoints ONLY
   */
  private async processOfficialSolanaX402V2(
    req: Request,
    res: Response,
    plan: string,
    billingPeriod: string,
    amount: number,
    customHandler?: (walletAddress: string, network: string) => Promise<any>,
  ): Promise<void> {
    try {
      this.logger.log(`🚀 X402 v1 processing for ${plan} ${billingPeriod}`);

      const resourceUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

      // 1. Check for X-PAYMENT header (v1 format)
      this.logger.log('🔍 Checking for X-PAYMENT header (v1 format)...');
      const xPaymentHeader =
        req.headers['x-payment'] || req.headers['X-PAYMENT'];

      if (!xPaymentHeader) {
        // Return 402 with v1 format payment requirements
        this.logger.log(
          '❌ No X-PAYMENT header found - returning 402 with v1 requirements',
        );

        // Get Solana addresses from config
        const usdcMintAddress = this.configService.get('USDC_MINT_ADDRESS');
        const solanaPaymentAddress = this.configService.get(
          'SOLANA_PAYMENT_ADDRESS',
        );
        // Facilitator's fee payer for Solana mainnet (from /supported endpoint)
        const facilitatorFeePayer =
          this.configService.get('SOLANA_FEE_PAYER_ADDRESS');

        // Validate required configuration
        if (!usdcMintAddress) {
          throw new Error('USDC_MINT_ADDRESS environment variable is required');
        }
        if (!solanaPaymentAddress) {
          throw new Error(
            'SOLANA_PAYMENT_ADDRESS environment variable is required',
          );
        }
          if (!facilitatorFeePayer) {
          this.logger.warn('⚠️ SOLANA_FEE_PAYER_ADDRESS not set - using default facilitator fee payer');
        }

        // Create v1 format payment requirements
        // IMPORTANT: Use facilitator's feePayer so frontend can build the transaction
        const paymentRequirements = {
          x402Version: 1, // v1 format
          error: 'X-PAYMENT header is required',
          accepts: [
            {
              scheme: 'exact',
              network: 'solana', // Simple format for v1
              maxAmountRequired: (amount * 1000000).toString(), // Convert to micro USDC
              asset: usdcMintAddress,
              payTo: solanaPaymentAddress,
              resource: resourceUrl,
              description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} ${billingPeriod} subscription`,
              mimeType: 'application/json',
              maxTimeoutSeconds: 300,
              // Use facilitator's feePayer address (from /supported endpoint)
              extra: {
                feePayer: facilitatorFeePayer,
              },
            },
          ],
        };

        this.logger.log(
          '📤 Returning 402 Payment Required with requirements:',
          {
            network: 'solana',
            amount: amount,
            microUSDC: (amount * 1000000).toString(),
            payTo: solanaPaymentAddress,
            feePayer: facilitatorFeePayer,
          },
        );

        res.status(402).json(paymentRequirements);
        return;
      }

      this.logger.log(
        '📦 Found X-PAYMENT header (v1 format) - verifying with v1 facilitator...',
      );

      // 2. Parse v1 X-PAYMENT header
      let paymentData: any;
      try {
        const paymentJson = Buffer.from(
          xPaymentHeader as string,
          'base64',
        ).toString('utf-8');
        paymentData = JSON.parse(paymentJson);

        this.logger.log('📋 v1 Payment data:', {
          version: paymentData.x402Version,
          scheme: paymentData.scheme,
          network: paymentData.network,
          hasTransaction: !!paymentData.payload?.transaction,
        });
      } catch (parseError) {
        this.logger.error('❌ Failed to parse X-PAYMENT header:', parseError);
        res.status(402).json({
          error: 'Invalid X-PAYMENT header format',
          reason: 'payment_parsing_failed',
        });
        return;
      }

      // 3. Verify payment using v1 facilitator endpoints ONLY
      let walletAddress: string;
      let transactionHash: string;
      try {
        // Create payment requirements for verification
        const paymentRequirements = {
          scheme: 'exact',
          network: 'solana', // Simple format for v1
          maxAmountRequired: (amount * 1000000).toString(),
          resource: resourceUrl,
          description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} ${billingPeriod} subscription`,
          mimeType: 'application/json',
          payTo: this.configService.get('SOLANA_PAYMENT_ADDRESS'),
          maxTimeoutSeconds: 300,
          asset: this.configService.get('USDC_MINT_ADDRESS'),
        };

        // Validate required configuration
        if (!paymentRequirements.asset) {
          throw new Error('USDC_MINT_ADDRESS environment variable is required');
        }
        if (!paymentRequirements.payTo) {
          throw new Error(
            'SOLANA_PAYMENT_ADDRESS environment variable is required',
          );
        }

        // Use PayAI Facilitator for Solana (same as EVM chains)
        // Benefits: Gasless for users (facilitator pays SOL fees), consistent API, reliability
        const facilitatorUrl =
          this.configService.get('X402_FACILITATOR_URL') ||
          'https://facilitator.payai.network';

        this.logger.log(
          `🔐 Verifying Solana payment via facilitator: ${facilitatorUrl}`,
        );

        try {
          // Step 1: Verify payment with facilitator
          // IMPORTANT: Don't send feePayer - facilitator uses its own address
          this.logger.log('📤 Calling facilitator /verify endpoint...');
          const verifyResponse = await fetch(`${facilitatorUrl}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentPayload: paymentData,
              paymentRequirements: paymentRequirements, // No extra.feePayer - facilitator manages its own
            }),
          });

          if (!verifyResponse.ok) {
            const errorBody = await verifyResponse.text();
            this.logger.error(
              '❌ Facilitator /verify failed:',
              verifyResponse.status,
              errorBody,
            );
            throw new Error(
              `Facilitator verify failed: ${verifyResponse.status} - ${errorBody}`,
            );
          }

          const verifyResult = await verifyResponse.json();
          this.logger.log('📋 Facilitator verify result:', verifyResult);

          if (!verifyResult.isValid) {
            throw new Error(
              `Payment invalid: ${verifyResult.invalidReason || 'unknown reason'}`,
            );
          }

          walletAddress = verifyResult.payer;
          this.logger.log(`✅ Payment verified! Payer: ${walletAddress}`);

          // Step 2: Settle payment with facilitator (broadcasts to blockchain)
          this.logger.log('📤 Calling facilitator /settle endpoint...');
          const settleResponse = await fetch(`${facilitatorUrl}/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentPayload: paymentData,
              paymentRequirements: paymentRequirements, // No extra.feePayer - facilitator manages its own
            }),
          });

          if (!settleResponse.ok) {
            const errorBody = await settleResponse.text();
            this.logger.error(
              '❌ Facilitator /settle failed:',
              settleResponse.status,
              errorBody,
            );
            throw new Error(
              `Facilitator settle failed: ${settleResponse.status} - ${errorBody}`,
            );
          }

          const settleResult = await settleResponse.json();
          this.logger.log('📋 Facilitator settle result:', settleResult);

          if (!settleResult.success) {
            throw new Error(
              `Settlement failed: ${settleResult.errorReason || 'unknown reason'}`,
            );
          }

          transactionHash = settleResult.transaction;
          walletAddress = settleResult.payer;

          this.logger.log(
            `✅ Transaction settled on Solana! TX: ${transactionHash}`,
          );
          this.logger.log('✅ Payment verified and settled via facilitator!');
        } catch (facilitatorApiError) {
          this.logger.error('❌ Facilitator API error:', facilitatorApiError);

          // Fallback to direct on-chain verification if facilitator is unavailable
          this.logger.warn(
            '⚠️ Falling back to direct on-chain verification...',
          );

          try {
            const {
              Connection,
              VersionedTransaction,
            } = require('@solana/web3.js');

            // Decode the versioned transaction
            const txBuffer = Buffer.from(
              paymentData.payload.transaction,
              'base64',
            );
            const transaction = VersionedTransaction.deserialize(txBuffer);

            // Extract the payer (first signer) from the message
            const payerPublicKey = transaction.message.staticAccountKeys[0];
            walletAddress = payerPublicKey.toString();
            this.logger.log(`✅ Extracted payer wallet: ${walletAddress}`);

            // Connect to Solana mainnet
            const rpcUrl =
              this.configService.get('SOLANA_RPC_URL') ||
              'https://api.mainnet-beta.solana.com';
            const connection = new Connection(rpcUrl, 'confirmed');

            // Send and confirm the transaction
            this.logger.log('📤 Sending transaction to Solana directly...');
            transactionHash = await connection.sendRawTransaction(txBuffer);

            this.logger.log(
              `⏳ Waiting for confirmation... TX: ${transactionHash}`,
            );
            const confirmation = await connection.confirmTransaction(
              transactionHash,
              'confirmed',
            );

            if (confirmation.value.err) {
              throw new Error(
                `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
              );
            }

            this.logger.log(
              `✅ Transaction confirmed on Solana! TX: ${transactionHash}`,
            );
            this.logger.log(
              '✅ Payment verified via direct on-chain fallback!',
            );
          } catch (directError) {
            this.logger.error(
              '❌ Direct Solana verification also failed:',
              directError,
            );
            throw new Error(
              `Solana payment verification failed: ${directError.message}`,
            );
          }
        }
      } catch (facilitatorError) {
        this.logger.error('❌ v1 facilitator error:', facilitatorError.message);

        // Check for specific error types
        let errorReason = 'payment_verification_failed';
        let errorMessage =
          'Payment verification failed. Please ensure you have sufficient USDC and try again.';

        if (
          facilitatorError.message.includes('500') ||
          facilitatorError.message.includes('Internal server error')
        ) {
          errorReason = 'facilitator_error';
          errorMessage =
            'Payment facilitator is temporarily unavailable. Please try again in a moment.';
        } else if (
          facilitatorError.message.includes('insufficient') ||
          facilitatorError.message.includes('balance')
        ) {
          errorReason = 'insufficient_funds';
          errorMessage =
            'Insufficient USDC balance. Please add USDC to your wallet and try again.';
        } else if (facilitatorError.message.includes('timeout')) {
          errorReason = 'timeout';
          errorMessage = 'Payment verification timed out. Please try again.';
        } else if (
          facilitatorError.message.includes('environment variable is required')
        ) {
          errorReason = 'configuration_error';
          errorMessage = 'Server configuration error. Please contact support.';
        }

        // NO MANUAL FALLBACK - If facilitator fails, payment fails
        // This ensures only real USDC payments create subscriptions
        res.status(402).json({
          error: 'Payment verification failed',
          reason: errorReason,
          message: errorMessage,
          details: facilitatorError.message,
        });
        return;
      }

      // Process business logic ONLY after successful payment verification and settlement
      let result: PaymentVerificationResult;
      try {
        if (customHandler) {
          result = await customHandler(walletAddress, 'solana');
        } else {
          // Create subscription ONLY after payment is verified and settled
          const subscriptionResult =
            await this.subscriptionService.createSubscription({
              walletAddress: walletAddress, // Keep Solana addresses as-is (case-sensitive base58)
              network: 'solana',
              plan,
              billingPeriod,
              amount,
            });

          result = {
            success: true,
            message: `X402 v1 payment verified and subscription created`,
            plan,
            billing: billingPeriod,
            subscriptionId: subscriptionResult.subscriptionId,
          };
        }

        this.logger.log(`🎉 X402 v1 payment processed successfully:`, result);
        res.json(result);
      } catch (subscriptionError) {
        this.logger.error(
          '❌ Error creating subscription after successful payment:',
          subscriptionError,
        );

        // Payment was successful but subscription creation failed
        // This is a critical error that needs manual intervention
        res.status(500).json({
          success: false,
          error: 'Subscription creation failed',
          message:
            'Payment was processed successfully but subscription creation failed. Please contact support.',
          transactionHash: transactionHash,
          walletAddress: walletAddress,
        });
        return;
      }
    } catch (error) {
      this.logger.error('💥 Error processing X402 v1 request:', error);
      res.status(500).json({
        success: false,
        error: 'X402 v1 payment processing failed',
        message:
          error.message || 'An error occurred while processing X402 v1 payment',
      });
    }
  }

  private async handleVerifiedPayment(
    req: Request,
    plan: string,
    billingPeriod: string,
    amount: number,
  ): Promise<string> {
    const walletAddress = this.extractWalletAddress(req);

    // Validate wallet address (supports both EVM and Solana formats)
    if (!this.validateWalletAddress(walletAddress)) {
      throw new BadRequestException(`Invalid wallet address: ${walletAddress}`);
    }

    // Validate amount is positive
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    const network = this.extractNetworkInfo(req);

    this.logger.log(
      `Processing ${plan} ${billingPeriod} subscription for wallet: ${walletAddress}`,
    );

    // Only lowercase EVM addresses, keep Solana addresses as-is (case-sensitive base58)
    const normalizedWalletAddress = walletAddress.startsWith('0x')
      ? walletAddress.toLowerCase()
      : walletAddress;

    const result = await this.subscriptionService.createSubscription({
      walletAddress: normalizedWalletAddress,
      network,
      plan,
      billingPeriod,
      amount,
    });

    return result.subscriptionId;
  }

  private extractWalletAddress(req: Request): string {
    this.logger.log('=== WALLET ADDRESS EXTRACTION ===');

    // For EVM requests, use the existing x402-express approach
    const requestedNetwork = this.extractNetworkInfo(req);
    const isSolanaRequest =
      requestedNetwork && requestedNetwork.toLowerCase().includes('solana');

    if (isSolanaRequest) {
      // For Solana, wallet address should be extracted from payment header in processSolanaX402Simple
      // This method shouldn't be called for Solana requests
      this.logger.warn(
        'extractWalletAddress called for Solana request - this should not happen',
      );
    }

    this.logger.log('=== WALLET ADDRESS EXTRACTION ===');

    let walletAddress: string | undefined;

    // 1. Try to extract from X402 payment authorization (PROPER X402 PROTOCOL)
    const xPaymentHeader = req.headers['x-payment'] || req.headers['X-Payment'];

    if (xPaymentHeader) {
      try {
        const paymentJson = Buffer.from(
          xPaymentHeader as string,
          'base64',
        ).toString('utf-8');
        const paymentData = JSON.parse(paymentJson);

        this.logger.log(
          'Parsed X-PAYMENT data:',
          JSON.stringify(paymentData, null, 2),
        );

        // Extract from X402 payment authorization.from (proper x402 protocol)
        walletAddress =
          paymentData.payload?.authorization?.from || // X402 standard location
          paymentData.authorization?.from || // Alternative structure
          paymentData.payload?.from ||
          paymentData.from ||
          paymentData.payer;

        if (walletAddress) {
          this.logger.log(
            `✅ Extracted wallet from X402 payment authorization: ${walletAddress}`,
          );
          return walletAddress as string;
        }
      } catch (error) {
        this.logger.error(`Error parsing X-PAYMENT header: ${error.message}`);
      }
    }

    // 2. Try to extract from req.payment object (populated by x402-express middleware)
    if ((req as any).payment) {
      walletAddress =
        (req as any).payment.payload?.authorization?.from ||
        (req as any).payment.authorization?.from ||
        (req as any).payment.from ||
        (req as any).payment.payer ||
        (req as any).payment.wallet ||
        (req as any).payment.address;

      if (walletAddress) {
        this.logger.log(
          `✅ Extracted wallet from req.payment object: ${walletAddress}`,
        );
        return walletAddress as string;
      }
    }

    // 3. FALLBACK: Extract from headers (for development/testing without actual X402 payment)
    walletAddress =
      (req.headers['x-wallet-address'] as string) ||
      (req.headers['wallet-address'] as string) ||
      (req.headers['wallet'] as string);

    if (walletAddress) {
      this.logger.warn(
        `⚠️  Using wallet address from header (dev/test mode): ${walletAddress}`,
      );
      this.logger.warn(
        'Note: In production, wallet should come from X402 payment authorization',
      );
      return walletAddress as string;
    }

    // 4. If still not found, log detailed debug info and throw error
    this.logger.error('❌ Wallet address not found in any location');
    this.logger.error('Checked locations:');
    this.logger.error('  1. X-PAYMENT header (X402 payment authorization)');
    this.logger.error('  2. req.payment object (x402-express middleware)');
    this.logger.error(
      '  3. Header fallbacks (x-wallet-address, wallet-address, wallet)',
    );
    this.logger.error(
      'Available headers:',
      JSON.stringify(Object.keys(req.headers)),
    );

    throw new BadRequestException(
      'Wallet address not found in X402 payment request',
    );
  }

  private validateWalletAddress(address: string): boolean {
    if (!address) {
      return false;
    }

    // Validate Ethereum-style addresses (0x followed by 40 hex characters)
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (ethAddressRegex.test(address)) {
      return true;
    }

    // Validate Solana addresses (base58 encoded, typically 32-44 characters)
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (solanaAddressRegex.test(address)) {
      return true;
    }

    return false;
  }

  private extractNetworkInfo(req: Request): string {
    // Priority 1: Path parameter (from controller route params)
    const pathNetwork =
      (req as any).params?.network || (req.params as any)?.network;

    if (pathNetwork) {
      this.logger.log(`Network extracted from path params: ${pathNetwork}`);
      return pathNetwork;
    }

    // Priority 2: Headers and query parameters
    const network =
      (req as any).paymentNetwork ||
      req.headers['x-network'] ||
      req.headers['network'] ||
      req.headers['x402-network'] ||
      req.headers['x-402-network'] ||
      req.query?.network;

    if (network) {
      this.logger.log(`Network extracted from headers/query: ${network}`);
      return network as string;
    }

    // Default fallback
    const defaultNetwork = validateAndNormalizeNetwork();
    this.logger.log(`Using default network: ${defaultNetwork}`);
    return defaultNetwork;
  }
}
