// import { HttpService } from '@nestjs/axios';
// import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { Cron } from '@nestjs/schedule';
// import { PrivyClient } from '@privy-io/server-auth';
// import { Queue } from 'bull';
// import { BillingPeriod, SubscriptionStatus } from 'prisma/generated/db1-client';
// import { firstValueFrom } from 'rxjs';
// import { PrismaDB1Service } from 'src/prisma/prisma-db1.service';
// import {
//     Address,
//     createPublicClient,
//     encodeFunctionData,
//     Hash,
//     http,
//     PublicClient,
// } from 'viem';
// import { base } from 'viem/chains';
// import {
//     PAY_AS_YOU_GO_QUEUE,
//     SUBSCRIPTION_QUEUE,
// } from '../../ogen-x/constants/constants';
// import {
//     PayAsYouGoInput,
//     SubscriptionPayinInput,
// } from '../../ogen-x/services/utils/privatex.consumer';
// import allowanceAbi from '../constants/allowanceAbi';
// import approvalABI from '../constants/approvalAbi';
// import abi from '../constants/coinbasePaymentContractAbi';
// import { waitForConfirmation } from '../utils/waitForConfirmation';

@Injectable()
export class ScheduleService {
  // private readonly privy: PrivyClient;
  // private readonly logger = new Logger(ScheduleService.name);
  // constructor(
  //     private configService: ConfigService,
  //     private readonly httpService: HttpService,
  // ) {
  //     const appId = this.configService.getOrThrow<string>('PRIVY_APP_ID');
  //     const appSecret =
  //         this.configService.getOrThrow<string>('PRIVY_APP_SECRET');
  //     const authorizationKey = this.configService.getOrThrow<string>(
  //         'PRIVY_AUTHORIZATION_PRIVATE_KEY',
  //     );
  //     console.log({ authorizationKey });
  //     this.privy = new PrivyClient(appId, appSecret, {
  //         walletApi: {
  //             authorizationPrivateKey: authorizationKey,
  //         },
  //     });
  // }
  // // @Cron('0 0 */1 * * *', { name: 'perform-hourly-task' })
  // async performHourly() {
  //     this.logger.log('Performing hourly check for credit balance...');
  //     let creditBalance = 0;
  //     const openRouterApiKey =
  //         this.configService.getOrThrow<string>('OPENROUTER_API_KEY');
  //     try {
  //         const response = await firstValueFrom(
  //             this.httpService.get('https://openrouter.ai/api/v1/credits', {
  //                 headers: { Authorization: `Bearer ${openRouterApiKey}` },
  //             }),
  //         );
  //         this.logger.log(
  //             `OpenRouter API response: ${JSON.stringify(response.data)}`,
  //         );
  //         const { total_credits, total_usage } = response.data.data;
  //         creditBalance = total_credits - total_usage;
  //         this.logger.log(`Credit balance: ${creditBalance}`);
  //     } catch (error) {
  //         this.logger.error('Error fetching OpenRouter API data', error);
  //     }
  //     const thresholdCredits = this.configService.getOrThrow<string>(
  //         'THRESHOLD_CREDITS_OPENROUTER',
  //     );
  //     const createCharge = async (
  //         amount: number,
  //         sender: string,
  //         chainId: number,
  //     ): Promise<any> => {
  //         try {
  //             const response = await firstValueFrom(
  //                 this.httpService.post(
  //                     'https://openrouter.ai/api/v1/credits/coinbase',
  //                     {
  //                         amount,
  //                         sender,
  //                         chain_id: chainId,
  //                     },
  //                     {
  //                         headers: {
  //                             Authorization: `Bearer ${openRouterApiKey}`,
  //                             'Content-Type': 'application/json',
  //                         },
  //                     },
  //                 ),
  //             );
  //             this.logger.log(
  //                 `Charge created: ${JSON.stringify(response.data)}`,
  //             );
  //             return response.data;
  //         } catch (error) {
  //             this.logger.error('Error creating charge', error);
  //             throw error;
  //         }
  //     };
  //     if (creditBalance < parseInt(thresholdCredits)) {
  //         //recharge the credits
  //         this.logger.log(
  //             'Credit balance is below threshold. Initiating transaction to recharge credits using Privy...',
  //         );
  //         const openRouterCreditsRechargeAmountInUSD =
  //             this.configService.getOrThrow<string>(
  //                 'OPENROUTER_CREDITS_RECHARGE_AMOUNT',
  //             );
  //         const serverWalletId =
  //             this.configService.getOrThrow<string>('SERVER_WALLET_ID');
  //         const serverWalletAddress = this.configService.getOrThrow<string>(
  //             'SERVER_WALLET_ADDRESS',
  //         );
  //         const baseRpcUrl =
  //             this.configService.getOrThrow<string>('BASE_RPC_URL');
  //         const chargeCreated = await createCharge(
  //             parseInt(openRouterCreditsRechargeAmountInUSD),
  //             serverWalletAddress,
  //             8453,
  //         );
  //         console.log({ chargeCreated });
  //         const { contract_address } =
  //             chargeCreated?.data?.web3_data?.transfer_intent?.metadata;
  //         const call_data =
  //             chargeCreated?.data?.web3_data?.transfer_intent?.call_data;
  //         const usdcTokenAddress: Address =
  //             this.configService.getOrThrow<string>(
  //                 'USDC_TOKEN_ADDRESS_ON_BASE',
  //             ) as Address;
  //         const usdcTokensToSendInBuffer: Address =
  //             this.configService.getOrThrow<string>(
  //                 'USDC_TOKENS_TO_SEND_IN_BUFFER_IN_WEI',
  //             ) as Address;
  //         const totalUsdcAmountToSendWithBuffer = BigInt(
  //             call_data.recipient_amount +
  //                 call_data.fee_amount +
  //                 usdcTokensToSendInBuffer,
  //         );
  //         const publicClient = createPublicClient({
  //             chain: base,
  //             transport: http(baseRpcUrl),
  //         });
  //         const checkAllowance = async (
  //             tokenAddress: Address,
  //             ownerAddress: Address,
  //             spenderAddress: Address,
  //             publicClient: PublicClient,
  //         ): Promise<bigint> => {
  //             try {
  //                 const allowance = await publicClient.readContract({
  //                     address: tokenAddress,
  //                     abi: allowanceAbi,
  //                     functionName: 'allowance',
  //                     args: [ownerAddress, spenderAddress],
  //                 });
  //                 this.logger.log(
  //                     `Current allowance for ${spenderAddress}: ${allowance.toString()} tokens`,
  //                 );
  //                 return allowance;
  //             } catch (error) {
  //                 this.logger.error('Error checking allowance:', error);
  //                 throw error;
  //             }
  //         };
  //         const currentAllowance = await checkAllowance(
  //             usdcTokenAddress,
  //             serverWalletAddress as Address,
  //             contract_address as Address,
  //             publicClient as PublicClient,
  //         );
  //         this.logger.log(
  //             `Current allowance: ${currentAllowance}, Required amount: ${totalUsdcAmountToSendWithBuffer}`,
  //         );
  //         // Only approve if the current allowance is less than the required amount
  //         if (currentAllowance < totalUsdcAmountToSendWithBuffer) {
  //             this.logger.log(
  //                 `Approving contract ${contract_address} to spend ${totalUsdcAmountToSendWithBuffer} USDC from ${serverWalletAddress}...`,
  //             );
  //             const data = encodeFunctionData({
  //                 abi: approvalABI,
  //                 functionName: 'approve',
  //                 args: [contract_address, totalUsdcAmountToSendWithBuffer],
  //             });
  //             const transactionParam = {
  //                 to: usdcTokenAddress.toLowerCase(),
  //                 chainId: base.id,
  //                 data: data,
  //             };
  //             const approved: any =
  //                 await this.privy.walletApi.ethereum.sendTransaction({
  //                     walletId: serverWalletId,
  //                     chainType: 'ethereum',
  //                     caip2: `eip155:${base.id}`,
  //                     transaction: transactionParam,
  //                 });
  //             await waitForConfirmation(
  //                 publicClient as PublicClient,
  //                 approved.hash as Hash,
  //             );
  //             this.logger.log(
  //                 // `Transaction has been approved. Approval transaction hash: ${approved.hash}`,
  //                 `Transaction has been approved. Approval transaction hash:`,
  //             );
  //         } else {
  //             this.logger.log(
  //                 'Sufficient allowance already exists, skipping approval',
  //             );
  //         }
  //         // check if destination currency is already USDC or not. If yes then direct transfer the funds (no need to swap using coinbase)
  //         // else use the code in if condition.
  //         if (call_data.recipient_currency != usdcTokenAddress) {
  //             this.logger.log(
  //                 `Swapping and transferring USDC to ${call_data.recipient_currency} using Uniswap V3...`,
  //             );
  //             const poolFeesTier = 500;
  //             const data = encodeFunctionData({
  //                 abi: abi,
  //                 functionName: 'swapAndTransferUniswapV3TokenPreApproved',
  //                 args: [
  //                     {
  //                         recipientAmount: BigInt(call_data.recipient_amount),
  //                         deadline: BigInt(
  //                             Math.floor(
  //                                 new Date(call_data.deadline).getTime() /
  //                                     1000,
  //                             ),
  //                         ),
  //                         recipient: call_data.recipient,
  //                         recipientCurrency: call_data.recipient_currency,
  //                         refundDestination: call_data.refund_destination,
  //                         feeAmount: BigInt(call_data.fee_amount),
  //                         id: call_data.id,
  //                         operator: call_data.operator,
  //                         signature: call_data.signature,
  //                         prefix: call_data.prefix,
  //                     },
  //                     usdcTokenAddress, // Address of the input token
  //                     totalUsdcAmountToSendWithBuffer, // Maximum amount user is willing to pay
  //                     poolFeesTier,
  //                 ],
  //             });
  //             const transactionParam = {
  //                 to: contract_address.toLowerCase(),
  //                 chainId: base.id,
  //                 data: data,
  //             };
  //             const transactionRequestWithParams = {
  //                 walletId: serverWalletId,
  //                 chainType: 'ethereum',
  //                 caip2: `eip155:${base.id}`,
  //                 transaction: transactionParam,
  //             };
  //             const transactionHash: any =
  //                 await this.privy.walletApi.ethereum.sendTransaction(
  //                     transactionRequestWithParams,
  //                 );
  //             await waitForConfirmation(
  //                 publicClient as PublicClient,
  //                 transactionHash.hash as Hash,
  //             );
  //             this.logger.log(`Transaction hash: ${transactionHash.hash}`);
  //         } else {
  //             this.logger.log(
  //                 `Transferring ${totalUsdcAmountToSendWithBuffer} USDC to ${call_data.recipient}...`,
  //             );
  //             const data = encodeFunctionData({
  //                 abi: abi,
  //                 functionName: 'transferTokenPreApproved',
  //                 args: [
  //                     {
  //                         recipientAmount: BigInt(call_data.recipient_amount),
  //                         deadline: BigInt(
  //                             Math.floor(
  //                                 new Date(call_data.deadline).getTime() /
  //                                     1000,
  //                             ),
  //                         ),
  //                         recipient: call_data.recipient,
  //                         recipientCurrency: call_data.recipient_currency,
  //                         refundDestination: call_data.refund_destination,
  //                         feeAmount: BigInt(call_data.fee_amount),
  //                         id: call_data.id,
  //                         operator: call_data.operator,
  //                         signature: call_data.signature,
  //                         prefix: call_data.prefix,
  //                     },
  //                 ],
  //             });
  //             const transactionParam = {
  //                 to: contract_address.toLowerCase(),
  //                 chainId: base.id,
  //                 data: data,
  //             };
  //             const transactionRequestWithParams = {
  //                 walletId: serverWalletId,
  //                 chainType: 'ethereum',
  //                 caip2: `eip155:${base.id}`,
  //                 transaction: transactionParam,
  //             };
  //             const transactionHash: any =
  //                 await this.privy.walletApi.ethereum.sendTransaction(
  //                     transactionRequestWithParams,
  //                 );
  //             await waitForConfirmation(
  //                 publicClient as PublicClient,
  //                 transactionHash.hash as Hash,
  //             );
  //             this.logger.log(`Transaction hash: ${transactionHash.hash}`);
  //         }
  //     }
  // }
}
