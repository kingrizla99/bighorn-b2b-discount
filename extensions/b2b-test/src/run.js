/**
 * BIGHORN B2B Aggregate Discount Function - DIAGNOSTIC VERSION
 * 
 * Applies a flat 10% discount to any 15pack product to verify function execution.
 */

export function run(input) {
  const cart = input.cart;
  const discounts = [];
  
  for (const line of cart.lines) {
    const variant = line.merchandise;
    const product = variant?.product;
    
    // Check if product is tagged "15pack"
    if (product?.hasAnyTag === true) {
      // Apply a flat 10% discount for testing
      discounts.push({
        message: "B2B Test Discount (10%)",
        targets: [{ cartLine: { id: line.id } }],
        value: {
          percentage: { value: "10.0" }
        }
      });
    }
  }
  
  return { discounts };
}
