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
 * 1. Identify catalog (Guidefitters or Resellers) from buyer identity
 * 2. Count aggregate quantity of 15pack items
 * 3. Determine which tier the aggregate triggers
 * 4. For each line, calculate discount to reach target tier price
 * 
 * This approach is dynamic — when catalog pricing changes, update the metafields,
 * not the code.
 */

/**
 * Get catalog type from purchasing company
 * Returns "guidefitters" or "resellers" based on catalog title
 */
function getCatalogType(buyerIdentity) {
  const catalogTitle = buyerIdentity?.purchasingCompany?.location?.catalog?.title;
  
  if (!catalogTitle) {
    return null; // Not a B2B customer
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
 * Parse tier configuration from shop metafield
 * 
 * Expected format:
 * {
 *   "guidefitters": {
 *     "base_percent": 22,
 *     "tiers": [
 *       { "min": 12, "percent": 33 },
 *       { "min": 48, "percent": 45 }
 *     ]
 *   },
 *   "resellers": {
 *     "base_percent": 45,
 *     "tiers": [
 *       { "min": 48, "percent": 50 }
 *     ]
 *   }
 * }
 */
function getTierConfig(shopMetafield) {
  if (!shopMetafield?.value) {
    console.error("No tier config metafield found");
    return null;
  }
  
  try {
    return JSON.parse(shopMetafield.value);
  } catch (e) {
    console.error("Failed to parse tier config:", e);
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
    return 0; // No discount needed, already at or below target
  }
  
  const discount = ((currentPrice - targetPrice) / currentPrice) * 100;
  return Math.round(discount * 100) / 100; // Round to 2 decimal places
}

/**
 * Main function entry point
 */
export function run(input) {
  const cart = input.cart;
  const buyerIdentity = cart?.buyerIdentity;
  
  // 1. Get catalog type (guidefitters or resellers)
  const catalogType = getCatalogType(buyerIdentity);
  
  if (!catalogType) {
    // Not a B2B customer or no catalog assigned
    return { discounts: [] };
  }
  
  // 2. Get tier configuration from shop metafield
  const config = getTierConfig(input.shop?.tierConfigMetafield);
  
  if (!config) {
    console.error("No tier config available");
    return { discounts: [] };
  }
  
  const catalogConfig = config[catalogType];
  
  if (!catalogConfig) {
    console.error(`No config for catalog: ${catalogType}`);
    return { discounts: [] };
  }
  
  // 3. Identify eligible lines and count aggregate quantity
  let aggregateQuantity = 0;
  const eligibleLines = [];
  
  for (const line of cart.lines) {
    const variant = line.merchandise;
    const product = variant?.product;
    
    // Check if product is tagged "15pack"
    if (product?.hasAnyTag === true) {
      const listPriceValue = variant?.listPriceMetafield?.value;
      const listPrice = parseFloat(listPriceValue);
      
      if (!listPriceValue || isNaN(listPrice)) {
        // Skip this line if no list price metafield
        // Log for debugging but don't fail the whole function
        console.error(`No list price metafield for variant ${variant?.id}, product: ${product?.title}`);
        continue;
      }
      
      const currentPriceValue = line.cost?.amountPerQuantity?.amount;
      const currentPrice = parseFloat(currentPriceValue);
      
      if (!currentPriceValue || isNaN(currentPrice)) {
        console.error(`No current price for line ${line.id}`);
        continue;
      }
      
      aggregateQuantity += line.quantity;
      eligibleLines.push({
        id: line.id,
        quantity: line.quantity,
        currentPrice: currentPrice,
        listPrice: listPrice,
        productTitle: product?.title
      });
    }
  }
  
  if (eligibleLines.length === 0 || aggregateQuantity === 0) {
    return { discounts: [] };
  }
  
  // 4. Determine aggregate tier
  const aggregateTier = getTierForQuantity(catalogConfig.tiers, aggregateQuantity);
  const aggregatePercent = aggregateTier ? aggregateTier.percent : catalogConfig.base_percent;
  
  // 5. Calculate discounts for each eligible line
  const discounts = [];
  
  for (const line of eligibleLines) {
    // Calculate target price based on aggregate tier
    // Target = List Price × (1 - discount%)
    const targetPrice = line.listPrice * (1 - aggregatePercent / 100);
    
    // Calculate discount needed to reach target price from current price
    const discountPercent = calculateDiscountPercent(line.currentPrice, targetPrice);
    
    if (discountPercent > 0) {
      discounts.push({
        message: `B2B Volume Discount (${aggregateQuantity} units)`,
        targets: [{ cartLine: { id: line.id } }],
        value: {
          percentage: { value: discountPercent.toString() }
        }
      });
    }
  }
  
  return { discounts };
}
