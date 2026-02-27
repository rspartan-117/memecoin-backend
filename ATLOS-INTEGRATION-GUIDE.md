# Atlos Payment Gateway Integration Guide

## ✅ Integration Complete

The Atlos payment gateway has been successfully integrated into the application!

## What Was Done

### 1. Module Integration
- ✅ Added `PaymentsModule` to [app.module.ts](src/app.module.ts)
- ✅ Configured raw body middleware in [main.ts](src/main.ts) for webhook signature verification
- ✅ Enabled `AtlosWebhookGuard` in [webhook.controller.ts](src/payments/webhook.controller.ts)

### 2. Payment Flow Architecture

```
┌─────────────────────┐
│  Atlos Gateway      │
│  (Payment Provider) │
└──────────┬──────────┘
           │ Webhook
           ▼
┌─────────────────────────────────────────┐
│  POST /payments/webhook/generative-world/│
│  confirm-payin-completed                 │
└──────────┬──────────────────────────────┘
           │ Verified by AtlosWebhookGuard
           ▼
┌──────────────────────────────────────────┐
│  PaymentsWebhookService                  │
│  - handleAtlosTopUpPayment()             │
│  - handleSubscriptionActivation()        │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  Credits Provisioned                     │
│  - TopUp record (240 credits/$)          │
│  - Subscription record (plan-specific)   │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  Credit Deduction (existing)             │
│  - game-gen-credit.service.ts            │
│  - Handles FREE, TOP_UP, SUBSCRIPTION    │
└──────────────────────────────────────────┘
```

## Required Environment Variables

Add these to your `.env` file:

```bash
# Atlos Payment Gateway Configuration
ATLOS_MERCHANT_ID=your_merchant_id_here
ATLOS_API_SECRET=your_api_secret_here

# Credit Conversion Rate for Top-Ups (optional, defaults to 240)
CREDITS_PER_AMOUNT_TOP_UP=240

# Credit Conversion Rate for Pay-As-You-Go (optional, defaults to 200)
CREDIT_PER_DOLLAR=200
```

### How to Get Atlos Credentials

1. Sign up at [https://atlos.io](https://atlos.io)
2. Navigate to your merchant dashboard
3. Copy your **Merchant ID**
4. Generate an **API Secret** for webhook verification
5. Configure your webhook URL: `https://your-domain.com/payments/webhook/generative-world/confirm-payin-completed`

## Payment Types Supported

### 1. Top-Up Payments (One-Time)
- User pays once, receives credits immediately
- **Rate:** 240 credits per USD
- Creates/updates `TopUp` record in database
- If user has active subscription, credits are added to subscription instead
- Pauses free credits when first top-up is made

**Webhook Payload Example:**
```json
{
  "InvoiceId": "inv_123456",
  "Status": 100,
  "UserAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "Amount": "10.00",
  "Asset": "USDC",
  "Blockchain": "ethereum",
  "SubscriptionId": null
}
```

### 2. Subscription Payments (Recurring)
- User subscribes to a tier (STARTER, STANDARD, PRO, ENTERPRISE)
- Billing periods: MONTHLY, QUARTERLY, YEARLY
- Credits refresh on each billing cycle
- Automatically handles renewals
- Transfers remaining TopUp credits to subscription on activation

**Webhook Payload Example:**
```json
{
  "InvoiceId": "inv_789012",
  "Status": 100,
  "UserAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "Amount": "29.99",
  "Asset": "USDC",
  "Blockchain": "ethereum",
  "SubscriptionId": "sub_xyz123"
}
```

## API Endpoints Available

All endpoints are under `/payments`:

### Credit Information
- `GET /payments/lifetime-credits` - Total credits user has earned
- `GET /payments/credits-details` - Available, used, and total credits
- `GET /payments/current-plan` - Current payment plan (FREE, TOP_UP, SUBSCRIPTION)
- `GET /payments/credits/:userId` - Get user's available credits

### Subscription Management
- `POST /payments/subscription` - Create new subscription
- `GET /payments/subscription-plan-details` - Get subscription details
- `POST /payments/subscription/cancel` - Cancel subscription
- `GET /payments/active-subscription` - Get active subscription info

### Top-Up Management
- `GET /payments/top-up-plan-details` - Get top-up balance details

### Transaction History
- `GET /payments/transaction-history` - Get payment transaction history

### Webhook (Internal)
- `POST /payments/webhook/generative-world/confirm-payin-completed` - Atlos webhook handler

## Webhook Security

The `AtlosWebhookGuard` verifies webhook authenticity using HMAC-SHA256:

1. Extracts `signature` header from request
2. Computes HMAC-SHA256 of raw request body using `ATLOS_API_SECRET`
3. Compares computed signature with received signature
4. Rejects request if signatures don't match

**Important:** The raw body middleware MUST be configured (already done in [main.ts](src/main.ts)) for signature verification to work.

## Credit Deduction (Already Working)

The existing [game-gen-credit.service.ts](src/projects/services/game-gen-credit.service.ts) already handles credit deduction for:

- ✅ **FREE Plan** - Deducts from `Credits` model
- ✅ **TOP_UP Plan** - Deducts from `TopUp` model
- ✅ **SUBSCRIPTION Plan** - Deducts from `Subscription` model

No changes needed to credit deduction logic!

## Testing the Integration

### 1. Test Webhook Locally

Use ngrok or similar tool to expose your local server:

```bash
ngrok http 4000
```

Then configure the ngrok URL in Atlos dashboard:
```
https://your-ngrok-url.ngrok.io/payments/webhook/generative-world/confirm-payin-completed
```

### 2. Test Webhook Signature

Send a test webhook with signature:

```bash
# Calculate signature
echo -n '{"InvoiceId":"test123","Status":100}' | openssl dgst -sha256 -hmac "your_api_secret" -binary | base64

# Send webhook
curl -X POST http://localhost:4000/payments/webhook/generative-world/confirm-payin-completed \
  -H "Content-Type: application/json" \
  -H "signature: YOUR_CALCULATED_SIGNATURE" \
  -d '{"InvoiceId":"test123","Status":100}'
```

### 3. Monitor Logs

The webhook service has extensive logging. Check your console for:

```
[PaymentsWebhookService] Processing payin completed event
[PaymentsWebhookService] Processing Atlos top-up payment for InvoiceId: inv_123
[PaymentsWebhookService] Successfully processed Atlos top-up payment for user xyz...
```

## Database Changes

The payment system uses existing Prisma models:

- **Credits** - Free tier credits
- **TopUp** - One-time purchase credits
- **Subscription** - Recurring subscription credits
- **Transaction** - Payment transaction records
- **Users** - `currentPlan` field updated on payment

## Next Steps (Optional)

### Remove PayAsYouGo Model

The `PayAsYouGo` model exists in [schema.prisma](prisma/schema.prisma) but is not implemented. Consider removing it:

1. Remove `PayAsYouGo` model (lines 132-141)
2. Remove `PayAsYouGoStatus` enum
3. Remove `BillingFrequency` enum (only used by PayAsYouGo)
4. Remove `PAY_AS_YOU_GO` from `PaymentPlan` enum
5. Update [game-gen-credit.service.ts](src/projects/services/game-gen-credit.service.ts) to remove the commented PAY_AS_YOU_GO case

Run migration:
```bash
npx prisma migrate dev --name remove_pay_as_you_go
```

## Support

For issues with:
- **Atlos Gateway**: Contact Atlos support at support@atlos.io
- **Integration Code**: Check logs in `PaymentsWebhookService` and `AtlosWebhookGuard`
- **Credit Deduction**: Check `GameGenCreditService` logs

## Summary

✅ Payment gateway is fully integrated  
✅ Webhooks are secured with signature verification  
✅ Credits are automatically provisioned  
✅ Existing credit deduction works seamlessly  
✅ Both top-up and subscription payments supported  

Your users can now purchase credits through Atlos gateway, and the system will automatically provision and deduct credits!
