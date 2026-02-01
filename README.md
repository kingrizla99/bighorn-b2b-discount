# BIGHORN B2B Aggregate Discount Function

Applies volume discounts based on **aggregate cart quantity** of products tagged `15pack`.

## How It Works

1. Counts total quantity of `15pack` tagged items in cart
2. Determines which aggregate tier this triggers (based on config)
3. For each line item, checks if per-SKU tier already triggered (based on that line's quantity)
4. If aggregate tier > per-SKU tier → applies the **difference** discount

### Example Scenarios

**Scenario 1: Mixed small quantities (most common)**
- Cart: 4 Butter Chicken + 2 BBQ + 3 Mushroom + 1 Marsala + 2 Carbonara = **12 total**
- No single SKU hits 12 → all at base price
- Aggregate = 12 → triggers Tier 2
- Result: All items get 14.07% discount

**Scenario 2: One SKU hits threshold, others don't**
- Cart: 12 Birria + 6 Butter Chicken = **18 total**
- Birria (qty 12): per-SKU Tier 2 triggered → already discounted
- Butter Chicken (qty 6): at base price
- Aggregate = 18 → triggers Tier 2
- Result: Birria gets 0% additional, Butter Chicken gets 14.07%

**Scenario 3: Aggregate triggers higher tier than any per-SKU**
- Cart: 30 Birria + 20 Butter Chicken = **50 total**
- Both at per-SKU Tier 2 (12-47)
- Aggregate = 50 → triggers Tier 3
- Result: Both get ~18% additional discount (to reach Tier 3 from Tier 2)

---

## Configuration

Stored in shop metafield: `b2b_discount.tier_config`

Current configuration:
```json
{
  "guidefitters": {
    "tiers": [
      { "min_quantity": 12, "discount_percent": 14.07 },
      { "min_quantity": 48, "discount_percent": 29.5 }
    ]
  },
  "resellers": {
    "tiers": [
      { "min_quantity": 48, "discount_percent": 9.1 }
    ]
  }
}
```

### How to Update Configuration

To change discount percentages or thresholds without code changes:

1. Go to **Settings** → **Custom data** → **Shop** → **Metafields**
2. Find `b2b_discount.tier_config`
3. Edit the JSON value
4. Save

**Or via API:**
```bash
# Example: Change Guidefitters Tier 2 to 15%
curl -X POST "https://bc22fe-2.myshopify.com/admin/api/2024-10/graphql.json" \
  -H "X-Shopify-Access-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { metafieldsSet(metafields: [{ ownerId: \"gid://shopify/Shop/67890741485\", namespace: \"b2b_discount\", key: \"tier_config\", type: \"json\", value: \"{\\\"guidefitters\\\":{\\\"tiers\\\":[{\\\"min_quantity\\\":12,\\\"discount_percent\\\":15},{\\\"min_quantity\\\":48,\\\"discount_percent\\\":29.5}]},\\\"resellers\\\":{\\\"tiers\\\":[{\\\"min_quantity\\\":48,\\\"discount_percent\\\":9.1}]}}\" }]) { metafields { value } userErrors { message } } }"
  }'
```

---

## Product Setup

Products must be tagged `15pack` to be included in aggregate calculations.

**Currently tagged:**
- Rich and Creamy Pasta Carbonara - 15 Pack
- The Best Butter Chicken and Rice - 15 Pack
- Chicken and Mushroom Marsala with Pasta - 15 Pack
- Vegetarian Creamy Mushroom Pasta - 15 Pack
- Bourbon BBQ Pulled Pork and Beans - 15 Pack
- Mexican Style Birria and Rice - 15 Pack

**NOT included (no tag):**
- Thermal Insulated Coozie (10-pack)
- Any non-meal accessories

To add a new wholesale meal product:
1. Create the product in Shopify
2. Add the `15pack` tag
3. Set up pricing in Guidefitters and Resellers catalogs

---

## Deployment

### Prerequisites
- Shopify CLI installed (`npm install -g @shopify/cli`)
- Node.js 18+

### Steps

1. Copy project to your machine
2. Navigate to project: `cd bighorn-b2b-discount`
3. Install dependencies: `npm install`
4. Link to store: `shopify app config link`
5. Deploy: `shopify app deploy`
6. Create discount in Shopify Admin:
   - Discounts → Create discount → App discount
   - Select "B2B Mixed Case Discount"
   - Name it, activate, no end date

---

## Testing

### Test Case 1: Mixed small quantities
1. Log in as Guidefitter customer
2. Add: 4 Butter Chicken + 4 Birria + 4 Carbonara (12 total, none ≥12 individually)
3. Go to checkout
4. **Expected:** All items show ~14% discount

### Test Case 2: One SKU at threshold
1. Log in as Guidefitter customer  
2. Add: 12 Birria + 2 Butter Chicken (14 total)
3. Go to checkout
4. **Expected:** Birria at catalog Tier 2 price, Butter Chicken shows ~14% discount

### Test Case 3: Reseller at 48+ threshold
1. Log in as Reseller customer
2. Add 50 units across various meals
3. Go to checkout
4. **Expected:** All items show ~9% discount

---

## Files

```
bighorn-b2b-discount/
├── shopify.app.toml              # App configuration
├── package.json                  # Dependencies
├── README.md                     # This file
└── extensions/
    └── b2b-aggregate-discount/
        ├── shopify.extension.toml  # Function config
        └── src/
            ├── run.graphql         # Input query
            └── run.js              # Function logic
```

---

## Troubleshooting

**Discount not appearing:**
- Verify customer is logged in as B2B (company member)
- Check company is assigned to Guidefitters or Resellers catalog
- Confirm products have `15pack` tag
- Ensure discount is activated in Shopify Admin

**Wrong discount amount:**
- Check the tier_config metafield values
- Verify aggregate quantity calculation (only `15pack` tagged items count)

**Viewing function logs:**
- Shopify Admin → Apps → OpenClaw → Monitoring
