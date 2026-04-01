# Shopify App Store Listing — Ziklo

## App name
Ziklo

## Tagline / Subtitle
Recurring subscriptions with Mercado Pago for Latin America

## Keywords
subscriptions, mercadopago, recurring, argentina, suscripciones

## Privacy policy URL
https://app.zikloapp.com/privacy

## Support email
contacto@zikloapp.com

## Pricing
Free to install

---

## Description

Ziklo lets you add recurring subscriptions to your Shopify store, powered by Mercado Pago — the #1 payment platform in Latin America.

Your customers subscribe directly from your product pages through a sleek widget that matches your store's look and feel. Payments are processed automatically by Mercado Pago, and Ziklo creates Shopify orders for each successful charge — keeping your inventory, analytics, and fulfillment in sync.

KEY FEATURES

• Flexible subscription plans — Create unlimited plans with custom pricing, frequency (weekly, monthly, quarterly), and benefits. Attach plans to specific products or offer store-wide subscriptions.

• Automatic payments — Mercado Pago handles recurring billing. When a payment is approved, Ziklo automatically creates a Shopify order so you can fulfill it like any other sale.

• Customer self-service portal — Your subscribers can view their plan, pause, resume, or cancel their subscription from a branded portal. No support tickets needed.

• Smart retention tools — When a customer tries to cancel, Ziklo offers alternatives: pause the subscription, apply a one-time discount, or collect feedback through a survey. Fully configurable from your dashboard.

• Real-time dashboard — Track active subscriptions, monthly recurring revenue, payment history, and failed charges at a glance.

• Automated email notifications — Customers receive confirmation emails, payment reminders (48h before charge), and failed payment alerts. All emails are sent automatically.

• Klaviyo integration — Send subscription events (created, renewed, paused, cancelled) to Klaviyo for advanced email marketing and segmentation.

• Per-product subscription widget — Install once, configure per product. The widget appears only on products you enable, showing benefits and subscription options.

BUILT FOR ARGENTINA AND LATIN AMERICA

Ziklo is designed specifically for merchants who sell in ARS using Mercado Pago. No currency conversion, no foreign payment gateways — just native recurring payments that your customers already trust.

GETTING STARTED

1. Install Ziklo and connect your Shopify store
2. Connect your Mercado Pago account (OAuth — no tokens to copy)
3. Create your first subscription plan
4. Enable subscriptions on your products
5. Add the widget to your theme — done!

Free plan available with up to 10 subscriptions per month. Paid plans start at $25/month for growing stores.

---

## Testing Instructions (for Shopify reviewer)

SETUP INSTRUCTIONS

1. Install the app on a development store
2. You will be redirected to the Ziklo login page
3. Register a new account with your email (a verification code will be sent)
4. After verifying, connect your Shopify store via OAuth (click "Conectar Shopify")
5. Connect Mercado Pago using the test credentials provided below

MERCADO PAGO TEST CREDENTIALS
- Use the OAuth flow: click "Conectar Mercado Pago" in the Integrations tab
- For testing, you can use MP's sandbox environment
- Test buyer email: test_user_123456@testuser.com
- Test card: Visa 4509 9535 6623 3704, CVV 123, Exp 11/25, Name APRO

HOW TO TEST CORE FUNCTIONALITY

A) Create a subscription plan:
   - Go to the "Planes" tab in the admin dashboard
   - Click "Crear plan"
   - Fill in: name, price (e.g. 1000 ARS), frequency (1 month)
   - Save the plan

B) Enable subscriptions on a product:
   - Go to the "Productos" tab
   - Toggle the switch on any product to enable subscriptions

C) Customer subscription flow:
   - Visit your dev store's storefront
   - Navigate to a product with subscriptions enabled
   - The Ziklo widget should appear below the Add to Cart button
   - Click "Suscribirme", enter email and shipping details
   - Complete payment through Mercado Pago checkout
   - After payment, the subscription appears in the admin dashboard

D) Customer portal:
   - Go to your dev store and click the subscription management link
     (sent via email after subscribing)
   - The customer can view, pause, resume, or cancel their subscription

E) Retention flow:
   - In the admin, go to "Retencion" tab and enable pause/discount options
   - When a customer cancels, they will see retention offers before confirming

ADMIN PANEL URL
https://app.zikloapp.com/admin

SUPPORT
Email: contacto@zikloapp.com

---

## Assets checklist

- [ ] App icon: 1200x1200px, PNG or JPG, max 1MB
- [ ] Screenshots: 3-6 images, 1600x900px each
  - [ ] Dashboard / metrics overview
  - [ ] Subscription plans management
  - [ ] Products with subscriptions enabled
  - [ ] Integrations (Mercado Pago connected)
  - [ ] Widget on storefront
- [ ] Screencast video: 2-3 min showing full flow (install > setup > subscribe)
