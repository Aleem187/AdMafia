import type { Plan } from './types';

export interface PlanConfig {
  id: Plan;
  name: string;
  price: number;
  tagline: string;
  features: string[];
  maxAccountsPerPlatform: number; // 0 = unlimited
  maxGenerations: number; // 0 = unlimited
  highlight?: boolean;
}

export const PLANS: Record<Plan, PlanConfig> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 99,
    tagline: 'For solo marketers testing the waters',
    features: [
      '1 ad account per platform',
      '15 AI generation runs / month',
      'Meta, Google & TikTok support',
      'Cross-platform analytics',
      'Email support',
    ],
    maxAccountsPerPlatform: 1,
    maxGenerations: 15,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    price: 249,
    tagline: 'For growing teams scaling ad output',
    features: [
      'Up to 5 ad accounts per platform',
      '50 AI generation runs / month',
      'Multi-platform publishing',
      'Advanced analytics & ROAS tracking',
      'Priority support',
    ],
    maxAccountsPerPlatform: 5,
    maxGenerations: 50,
    highlight: true,
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    price: 499,
    tagline: 'For agencies managing multiple clients',
    features: [
      'Unlimited ad accounts',
      'Unlimited AI generations (fair use)',
      'White-label reports',
      'Team collaboration',
      'Dedicated account manager',
      'API access',
    ],
    maxAccountsPerPlatform: 0,
    maxGenerations: 0,
  },
};

export const PLAN_LIST = Object.values(PLANS);
