// ============================================
// FILE: services/payment.service.js
// Multi-Provider Payment Service
// Supports: Flutterwave, Paystack, Hubtel, Stripe
// VERSION: 1.0
// ============================================

const axios = require('axios');

// ==========================================
// Configuration
// ==========================================

const config = {
  flutterwave: {
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
    baseUrl: 'https://api.flutterwave.com/v3'
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY,
    baseUrl: 'https://api.paystack.co'
  },
  hubtel: {
    clientId: process.env.HUBTEL_CLIENT_ID,
    clientSecret: process.env.HUBTEL_CLIENT_SECRET,
    merchantId: process.env.HUBTEL_MERCHANT_ID,
    baseUrl: 'https://api.hubtel.com/v2/pos'
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
  }
};

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://cybev.io';
const WEBHOOK_URL = process.env.API_URL || 'https://api.cybev.io';

// ==========================================
// Provider Status
// ==========================================

function getAvailableProviders() {
  return {
    flutterwave: !!config.flutterwave.secretKey,
    paystack: !!config.paystack.secretKey,
    hubtel: !!(config.hubtel.clientId && config.hubtel.clientSecret),
    stripe: !!config.stripe.secretKey
  };
}

function getDefaultProvider() {
  const providers = getAvailableProviders();
  if (providers.flutterwave) return 'flutterwave';
  if (providers.paystack) return 'paystack';
  if (providers.hubtel) return 'hubtel';
  if (providers.stripe) return 'stripe';
  return null;
}

// ==========================================
// FLUTTERWAVE
// ==========================================

const flutterwave = {
  async initializePayment({ amount, email, name, userId, type, metadata, currency = 'NGN', redirectUrl }) {
    try {
      const response = await axios.post(
        `${config.flutterwave.baseUrl}/payments`,
        {
          tx_ref: `cybev_${type}_${userId}_${Date.now()}`,
          amount,
          currency,
          redirect_url: redirectUrl || `${FRONTEND_URL}/payment/callback?provider=flutterwave`,
          customer: {
            email,
            name
          },
          customizations: {
            title: 'CYBEV',
            description: metadata?.description || 'Payment on CYBEV',
            logo: `${FRONTEND_URL}/logo.png`
          },
          meta: {
            userId,
            type,
            ...metadata
          }
        },
        {
          headers: {
            Authorization: `Bearer ${config.flutterwave.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.status === 'success') {
        return {
          success: true,
          provider: 'flutterwave',
          paymentUrl: response.data.data.link,
          reference: response.data.data.tx_ref
        };
      }

      throw new Error(response.data.message || 'Failed to initialize payment');
    } catch (error) {
      console.error('Flutterwave init error:', error.response?.data || error.message);
      throw error;
    }
  },

  async verifyPayment(transactionId) {
    try {
      const response = await axios.get(
        `${config.flutterwave.baseUrl}/transactions/${transactionId}/verify`,
        {
          headers: {
            Authorization: `Bearer ${config.flutterwave.secretKey}`
          }
        }
      );

      const data = response.data.data;
      return {
        success: data.status === 'successful',
        provider: 'flutterwave',
        transactionId: data.id,
        reference: data.tx_ref,
        amount: data.amount,
        currency: data.currency,
        customer: {
          email: data.customer.email,
          name: data.customer.name
        },
        metadata: data.meta,
        paidAt: data.created_at
      };
    } catch (error) {
      console.error('Flutterwave verify error:', error.response?.data || error.message);
      throw error;
    }
  },

  async initiateTransfer({ amount, bankCode, accountNumber, narration, currency = 'NGN' }) {
    try {
      const response = await axios.post(
        `${config.flutterwave.baseUrl}/transfers`,
        {
          account_bank: bankCode,
          account_number: accountNumber,
          amount,
          currency,
          narration,
          reference: `cybev_transfer_${Date.now()}`
        },
        {
          headers: {
            Authorization: `Bearer ${config.flutterwave.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: response.data.status === 'success',
        provider: 'flutterwave',
        transferId: response.data.data.id,
        reference: response.data.data.reference
      };
    } catch (error) {
      console.error('Flutterwave transfer error:', error.response?.data || error.message);
      throw error;
    }
  }
};

// ==========================================
// PAYSTACK
// ==========================================

const paystack = {
  async initializePayment({ amount, email, name, userId, type, metadata, currency = 'NGN', redirectUrl }) {
    try {
      // Paystack amount is in kobo (smallest currency unit)
      const amountInKobo = Math.round(amount * 100);

      const response = await axios.post(
        `${config.paystack.baseUrl}/transaction/initialize`,
        {
          email,
          amount: amountInKobo,
          currency,
          reference: `cybev_${type}_${userId}_${Date.now()}`,
          callback_url: redirectUrl || `${FRONTEND_URL}/payment/callback?provider=paystack`,
          metadata: {
            userId,
            type,
            name,
            ...metadata
          }
        },
        {
          headers: {
            Authorization: `Bearer ${config.paystack.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.status) {
        return {
          success: true,
          provider: 'paystack',
          paymentUrl: response.data.data.authorization_url,
          reference: response.data.data.reference,
          accessCode: response.data.data.access_code
        };
      }

      throw new Error(response.data.message || 'Failed to initialize payment');
    } catch (error) {
      console.error('Paystack init error:', error.response?.data || error.message);
      throw error;
    }
  },

  async verifyPayment(reference) {
    try {
      const response = await axios.get(
        `${config.paystack.baseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${config.paystack.secretKey}`
          }
        }
      );

      const data = response.data.data;
      return {
        success: data.status === 'success',
        provider: 'paystack',
        transactionId: data.id,
        reference: data.reference,
        amount: data.amount / 100, // Convert from kobo
        currency: data.currency,
        customer: {
          email: data.customer.email
        },
        metadata: data.metadata,
        paidAt: data.paid_at
      };
    } catch (error) {
      console.error('Paystack verify error:', error.response?.data || error.message);
      throw error;
    }
  },

  async initiateTransfer({ amount, recipientCode, reason }) {
    try {
      const response = await axios.post(
        `${config.paystack.baseUrl}/transfer`,
        {
          source: 'balance',
          amount: Math.round(amount * 100),
          recipient: recipientCode,
          reason
        },
        {
          headers: {
            Authorization: `Bearer ${config.paystack.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: response.data.status,
        provider: 'paystack',
        transferId: response.data.data.id,
        reference: response.data.data.reference
      };
    } catch (error) {
      console.error('Paystack transfer error:', error.response?.data || error.message);
      throw error;
    }
  },

  async createTransferRecipient({ name, accountNumber, bankCode }) {
    try {
      const response = await axios.post(
        `${config.paystack.baseUrl}/transferrecipient`,
        {
          type: 'nuban',
          name,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN'
        },
        {
          headers: {
            Authorization: `Bearer ${config.paystack.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: response.data.status,
        recipientCode: response.data.data.recipient_code
      };
    } catch (error) {
      console.error('Paystack recipient error:', error.response?.data || error.message);
      throw error;
    }
  },

  async getBanks() {
    try {
      const response = await axios.get(
        `${config.paystack.baseUrl}/bank`,
        {
          headers: {
            Authorization: `Bearer ${config.paystack.secretKey}`
          }
        }
      );

      return response.data.data.map(bank => ({
        name: bank.name,
        code: bank.code,
        country: bank.country
      }));
    } catch (error) {
      console.error('Paystack banks error:', error.response?.data || error.message);
      throw error;
    }
  }
};

// ==========================================
// HUBTEL (Ghana)
// ==========================================

const hubtel = {
  async initializePayment({ amount, email, name, phone, userId, type, metadata, redirectUrl }) {
    try {
      const response = await axios.post(
        `${config.hubtel.baseUrl}/checkout/initiate`,
        {
          totalAmount: amount,
          description: metadata?.description || 'Payment on CYBEV',
          callbackUrl: `${WEBHOOK_URL}/api/payments/webhook/hubtel`,
          returnUrl: redirectUrl || `${FRONTEND_URL}/payment/callback?provider=hubtel`,
          cancellationUrl: `${FRONTEND_URL}/payment/cancelled`,
          merchantBusinessLogoUrl: `${FRONTEND_URL}/logo.png`,
          merchantAccountNumber: config.hubtel.merchantId,
          clientReference: `cybev_${type}_${userId}_${Date.now()}`,
          customerMsisdn: phone,
          customerEmail: email,
          customerName: name
        },
        {
          auth: {
            username: config.hubtel.clientId,
            password: config.hubtel.clientSecret
          },
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.status === 'Success') {
        return {
          success: true,
          provider: 'hubtel',
          paymentUrl: response.data.data.checkoutUrl,
          reference: response.data.data.checkoutId
        };
      }

      throw new Error(response.data.message || 'Failed to initialize payment');
    } catch (error) {
      console.error('Hubtel init error:', error.response?.data || error.message);
      throw error;
    }
  },

  async verifyPayment(checkoutId) {
    try {
      const response = await axios.get(
        `${config.hubtel.baseUrl}/checkout/${checkoutId}/status`,
        {
          auth: {
            username: config.hubtel.clientId,
            password: config.hubtel.clientSecret
          }
        }
      );

      const data = response.data.data;
      return {
        success: data.transactionStatus === 'Success',
        provider: 'hubtel',
        transactionId: data.hubtelPreapprovalId,
        reference: data.clientReference,
        amount: data.totalAmountCharged,
        currency: 'GHS',
        customer: {
          phone: data.customerMsisdn
        },
        paidAt: data.transactionDate
      };
    } catch (error) {
      console.error('Hubtel verify error:', error.response?.data || error.message);
      throw error;
    }
  }
};

// ==========================================
// STRIPE (International)
// ==========================================

let stripe = null;

const stripeProvider = {
  async initializePayment({ amount, email, name, userId, type, metadata, currency = 'usd', redirectUrl }) {
    try {
      if (!stripe && config.stripe.secretKey) {
        stripe = require('stripe')(config.stripe.secretKey);
      }

      if (!stripe) {
        throw new Error('Stripe not configured');
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: email,
        line_items: [{
          price_data: {
            currency,
            product_data: {
              name: metadata?.description || 'CYBEV Payment',
              images: [`${FRONTEND_URL}/logo.png`]
            },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }],
        metadata: {
          userId,
          type,
          ...metadata
        },
        success_url: redirectUrl || `${FRONTEND_URL}/payment/callback?provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/payment/cancelled`
      });

      return {
        success: true,
        provider: 'stripe',
        paymentUrl: session.url,
        reference: session.id
      };
    } catch (error) {
      console.error('Stripe init error:', error.message);
      throw error;
    }
  },

  async verifyPayment(sessionId) {
    try {
      if (!stripe && config.stripe.secretKey) {
        stripe = require('stripe')(config.stripe.secretKey);
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      return {
        success: session.payment_status === 'paid',
        provider: 'stripe',
        transactionId: session.payment_intent,
        reference: session.id,
        amount: session.amount_total / 100,
        currency: session.currency,
        customer: {
          email: session.customer_email
        },
        metadata: session.metadata,
        paidAt: new Date(session.created * 1000).toISOString()
      };
    } catch (error) {
      console.error('Stripe verify error:', error.message);
      throw error;
    }
  }
};

// ==========================================
// UNIFIED PAYMENT INTERFACE
// ==========================================

const paymentService = {
  getAvailableProviders,
  getDefaultProvider,

  async initializePayment(provider, options) {
    const providers = {
      flutterwave,
      paystack,
      hubtel,
      stripe: stripeProvider
    };

    const selectedProvider = providers[provider];
    if (!selectedProvider) {
      throw new Error(`Unknown payment provider: ${provider}`);
    }

    return selectedProvider.initializePayment(options);
  },

  async verifyPayment(provider, reference) {
    const providers = {
      flutterwave,
      paystack,
      hubtel,
      stripe: stripeProvider
    };

    const selectedProvider = providers[provider];
    if (!selectedProvider) {
      throw new Error(`Unknown payment provider: ${provider}`);
    }

    return selectedProvider.verifyPayment(reference);
  },

  // Provider-specific methods
  flutterwave,
  paystack,
  hubtel,
  stripe: stripeProvider
};

// Log configured providers
const available = getAvailableProviders();
console.log('💰 Payment Providers:', Object.entries(available)
  .filter(([_, v]) => v)
  .map(([k]) => k)
  .join(', ') || 'None configured');

module.exports = paymentService;
