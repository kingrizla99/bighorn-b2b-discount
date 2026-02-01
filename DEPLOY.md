# Quick Deployment Guide

## Step 1: Get the project files

Option A - If you have SSH access to the server:
```bash
scp -r ubuntu@ip-172-31-1-155:/home/ubuntu/clawd/bighorn-b2b-discount ~/Desktop/
```

Option B - I can push to a GitHub repo if you prefer.

## Step 2: Navigate to the project
```bash
cd ~/Desktop/bighorn-b2b-discount
```

## Step 3: Install dependencies
```bash
npm install
```

## Step 4: Login to Shopify (if not already)
```bash
shopify auth login
```

## Step 5: Link to your store
```bash
shopify app config link
```
- Select **bc22fe-2.myshopify.com** when prompted
- When asked about app config, choose to **create a new app** or **link to OpenClaw**

## Step 6: Deploy
```bash
shopify app deploy
```

## Step 7: Activate the discount
1. Go to Shopify Admin → **Discounts**
2. Click **Create discount**
3. Select **B2B Mixed Case Discount** under App discounts
4. Name it, set to Active, no end date
5. Save

## Step 8: Test
- Log in as a Guidefitter customer
- Add 6 Birria + 6 Butter Chicken (12 total)
- Go to checkout → should see discount applied

---

Let me know when you're ready and I'll walk you through it live!
