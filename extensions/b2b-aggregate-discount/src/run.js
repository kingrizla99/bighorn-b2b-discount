/**
 * BIGHORN B2B Aggregate Discount Function
 * 
 * Applies volume discounts based on AGGREGATE cart quantity of products tagged "15pack".
 * 
 * Logic:
 * 1. Count total quantity of "15pack" tagged items in cart
 * 2. Determine which aggregate tier this triggers
 * 3. For each line item, check if per-SKU tier already triggered (based on line quantity)
 * 4. If aggregate tier > per-SKU tier, apply the DIFFERENCE discount
 * 
 * Configuration stored in shop metafield: b2b_discount.tier_config
 */

// Default configuration (used if metafield not found)
const DEFAULT_CONFIG = {
  guidefitters: {
    tiers: [
      { min_quantity: 12, discount_percent: 14.07 },
      { min_quantity: 48, discount_percent: 29.5 }
    ]
  },
  resellers: {
    tiers: [
      { min_quantity: 48, discount_percent: 9.1 }
    ]
  }
};

/**
 * Parse configuration from metafield or use default
 */
function getConfig(shopMetafield) {
  if (shopMetafield?.value) {
    try {
      return JSON.parse(shopMetafield.value);
    } catch (e) {
      console.error("Failed to parse tier config:", e);
    }
  }
  return DEFAULT_CONFIG;
}

/**
 * Determine catalog type from purchasing company
 * Returns "guidefitters" or "resellers" based on catalog title
 */
function getCatalogType(buyerIdentity) {
  const catalogTitle = buyerIdentity?.purchasingCompany?.location?.catalog?.title;
  
  if (!catalogTitle) {
    // Not a B2B customer or no catalog assigned
    return null;
  }
  
  const titleLower = catalogTitle.toLowerCase();
  
  if (titleLower.includes("reseller")) {
    return "resellers";
  }
  
  if (titleLower.includes("guidefitter")) {
    return "guidefitters";
  }
  
  // Default to guidefitters if B2B but catalog type unclear
  return "guidefitters";
}

/**
 * Get the tier that applies for a given quantity
 * Returns the tier object or null if no tier applies
 */
function getTierForQuantity(tiers, quantity) {
  // Sort tiers by min_quantity descending to find highest applicable tier
  const sortedTiers = [...tiers].sort((a, b) => b.min_quantity - a.min_quantity);
  
  for (const tier of sortedTiers) {
    if (quantity >= tier.min_quantity) {
      return tier;
    }
  }
  
  return null; // Base tier (no discount)
}

/**
 * Calculate the discount percentage to apply
 * This is the DIFFERENCE between aggregate tier and per-SKU tier
 * 
 * Example: If aggregate triggers 29.5% off but per-SKU already gave 14.07% off,
 * we need to apply additional discount to get from 14.07% to 29.5%
 * 
 * Math: To go from (1-0.1407) to (1-0.295):
 * New multiplier needed: 0.705 / 0.8593 = 0.8202
 * Additional discount: 1 - 0.8202 = 0.1798 = ~18%
 */
function calculateDifferenceDiscount(aggregateDiscountPercent, perSkuDiscountPercent) {
  if (aggregateDiscountPercent <= perSkuDiscountPercent) {
    return 0; // Per-SKU tier is same or better, no additional discount
  }
  
  if (perSkuDiscountPercent === 0) {
    // At base price, apply full aggregate discount
    return aggregateDiscountPercent;
  }
  
  // Calculate the additional discount needed
  const baseMultiplier = 1 - (perSkuDiscountPercent / 100);
  const targetMultiplier = 1 - (aggregateDiscountPercent / 100);
  const additionalMultiplier = targetMultiplier / baseMultiplier;
  const additionalDiscountPercent = (1 - additionalMultiplier) * 100;
  
  return Math.round(additionalDiscountPercent * 100) / 100; // Round to 2 decimals
}

/**
 * Main function entry point
 */
export function run(input) {
  const cart = input.cart;
  const buyerIdentity = cart?.buyerIdentity;
  
  // Get catalog type (guidefitters or resellers)
  const catalogType = getCatalogType(buyerIdentity);
  
  if (!catalogType) {
    // Not a B2B customer
    return { discounts: [] };
  }
  
  // Get tier configuration
  const config = getConfig(input.shop?.metafield);
  const catalogConfig = config[catalogType];
  
  if (!catalogConfig || !catalogConfig.tiers || catalogConfig.tiers.length === 0) {
    // No tiers configured for this catalog
    return { discounts: [] };
  }
  
  // Count aggregate quantity of "15pack" tagged items
  let totalEligibleQuantity = 0;
  const eligibleLines = [];
  
  for (const line of cart.lines) {
    const product = line.merchandise?.product;
    
    if (product?.hasAnyTag === true) {
      totalEligibleQuantity += line.quantity;
      eligibleLines.push({
        id: line.id,
        quantity: line.quantity,
        productTitle: product.title
      });
    }
  }
  
  if (eligibleLines.length === 0 || totalEligibleQuantity === 0) {
    return { discounts: [] };
  }
  
  // Determine aggregate tier
  const aggregateTier = getTierForQuantity(catalogConfig.tiers, totalEligibleQuantity);
  
  if (!aggregateTier) {
    // Aggregate quantity doesn't meet any tier threshold
    return { discounts: [] };
  }
  
  // Calculate discounts for each eligible line
  const discounts = [];
  
  for (const line of eligibleLines) {
    // Determine per-SKU tier (what Shopify already applied based on line quantity)
    const perSkuTier = getTierForQuantity(catalogConfig.tiers, line.quantity);
    const perSkuDiscount = perSkuTier ? perSkuTier.discount_percent : 0;
    
    // Calculate the difference discount needed
    const discountToApply = calculateDifferenceDiscount(
      aggregateTier.discount_percent,
      perSkuDiscount
    );
    
    if (discountToApply > 0) {
      discounts.push({
        message: `B2B Volume Discount (${totalEligibleQuantity} units)`,
        targets: [{ cartLine: { id: line.id } }],
        value: {
          percentage: { value: discountToApply.toString() }
        }
      });
    }
  }
  
  return { discounts };
}
