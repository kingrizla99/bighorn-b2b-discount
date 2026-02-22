/**
 * BIGHORN B2B Aggregate Discount Function
 * 
 * Applies volume discounts based on AGGREGATE cart quantity of products tagged "15pack".
 * 
 * Architecture:
 * - Shop metafield (b2b_discount.tier_config): Stores tier percentages per catalog
 * - Variant metafield (b2b_pricing.list_price): Stores list price per SKU
 * 
 * Logic:
 * 1. Detect catalog type from price ratio (current price vs list price)
 * 2. Count aggregate quantity of 15pack items
 * 3. Determine which tier the aggregate triggers
 * 4. For each line, calculate discount to reach target tier price
 * 
 * Price Ratio Detection:
 * - Guidefitters base = 22% off → ratio ~0.78
 * - Resellers base = 45% off → ratio ~0.55
 * - D2C (no B2B) = 0% off → ratio ~1.0
 */

/**
 * Detect catalog type from price ratio
 * Returns "guidefitters", "resellers", or null (D2C/not B2B)
 */
function detectCatalogFromPriceRatio(currentPrice, listPrice) {
  if (!currentPrice || !listPrice || listPrice <= 0) {
    return null;
  }
  
  const ratio = currentPrice / listPrice;
  
  // Resellers: 45% off → paying ~55% of list (ratio 0.50-0.60)
  if (ratio >= 0.50 && ratio <= 0.60) {
    return "resellers";
  }
  
  // Guidefitters: 22% off → paying ~78% of list (ratio 0.73-0.83)
  if (ratio >= 0.73 && ratio <= 0.83) {
    return "guidefitters";
  }
  
  // D2C or unknown - no aggregate discount applies
  return null;
}

/**
 * Parse tier configuration from shop metafield
 */
function getTierConfig(shopMetafield) {
  if (!shopMetafield?.value) {
    return null;
  }
  
  try {
    return JSON.parse(shopMetafield.value);
  } catch (e) {
    return null;
  }
}

/**
 * Get the tier that applies for a given quantity
 * Returns { min, percent } or null if base tier
 */
function getTierForQuantity(tiers, quantity) {
  if (!tiers || tiers.length === 0) {
    return null;
  }
  
  // Sort tiers by min descending to find highest applicable tier
  const sortedTiers = [...tiers].sort((a, b) => b.min - a.min);
  
  for (const tier of sortedTiers) {
    if (quantity >= tier.min) {
      return tier;
    }
  }
  
  return null; // Base tier
}

/**
 * Calculate discount percentage needed to go from current price to target price
 */
function calculateDiscountPercent(currentPrice, targetPrice) {
  if (currentPrice <= targetPrice) {
    return 0; // No discount needed
  }
  
  const discount = ((currentPrice - targetPrice) / currentPrice) * 100;
  return Math.round(discount * 100) / 100; // Round to 2 decimal places
}

/**
 * Main function entry point
 */
export function run(input) {
  const cart = input.cart;
  
  // Get tier configuration from shop metafield
  const config = getTierConfig(input.shop?.tierConfigMetafield);
  
  if (!config) {
    return { discounts: [] };
  }
  
  // First pass: collect eligible lines and detect catalog type
  let detectedCatalog = null;
  let aggregateQuantity = 0;
  const eligibleLines = [];
  
  for (const line of cart.lines) {
    const variant = line.merchandise;
    const product = variant?.product;
    
    // Check if product is tagged "15pack"
    if (product?.hasAnyTag !== true) {
      continue;
    }
    
    const listPriceValue = variant?.listPriceMetafield?.value;
    const listPrice = parseFloat(listPriceValue);
    
    if (!listPriceValue || isNaN(listPrice) || listPrice <= 0) {
      continue;
    }
    
    const currentPriceValue = line.cost?.amountPerQuantity?.amount;
    const currentPrice = parseFloat(currentPriceValue);
    
    if (!currentPriceValue || isNaN(currentPrice)) {
      continue;
    }
    
    // Detect catalog from first eligible line's price ratio
    if (detectedCatalog === null) {
      detectedCatalog = detectCatalogFromPriceRatio(currentPrice, listPrice);
      
      // If not a B2B customer, exit early
      if (detectedCatalog === null) {
        return { discounts: [] };
      }
    }
    
    aggregateQuantity += line.quantity;
    eligibleLines.push({
      id: line.id,
      quantity: line.quantity,
      currentPrice: currentPrice,
      listPrice: listPrice
    });
  }
  
  if (eligibleLines.length === 0 || aggregateQuantity === 0) {
    return { discounts: [] };
  }
  
  // Get config for detected catalog
  const catalogConfig = config[detectedCatalog];
  
  if (!catalogConfig) {
    return { discounts: [] };
  }
  
  // Determine aggregate tier
  const aggregateTier = getTierForQuantity(catalogConfig.tiers, aggregateQuantity);
  
  // If no higher tier applies, no additional discount needed
  // (they're already getting base catalog pricing)
  if (!aggregateTier) {
    return { discounts: [] };
  }
  
  const aggregatePercent = aggregateTier.percent;
  
  // Calculate discounts for each eligible line
  const discounts = [];
  
  for (const line of eligibleLines) {
    // Target price based on aggregate tier
    // Target = List Price × (1 - tier_percent / 100)
    const targetPrice = line.listPrice * (1 - aggregatePercent / 100);
    
    // Calculate discount needed from current price to target price
    const discountPercent = calculateDiscountPercent(line.currentPrice, targetPrice);
    
    if (discountPercent > 0) {
      discounts.push({
        message: `B2B Volume Tier (${aggregateQuantity} units)`,
        targets: [{ cartLine: { id: line.id } }],
        value: {
          percentage: { value: discountPercent.toString() }
        }
      });
    }
  }
  
  return { discounts };
}
