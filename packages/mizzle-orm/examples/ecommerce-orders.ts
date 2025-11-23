/**
 * E-Commerce Order System with Historical Embeds
 *
 * This example demonstrates using embeds for order history where
 * you want to preserve the EXACT state of products at purchase time.
 *
 * Key Features:
 * - Product snapshots in order items (NO auto-update)
 * - Customer info in orders (auto-updates for contact changes)
 * - Shipping address snapshots
 *
 * Run with: tsx examples/ecommerce-orders.ts
 */

import {
  mizzle,
  defineSchema,
  mongoCollection,
  embed,
  objectId,
  string,
  number,
  date,
  array,
  object,
  publicId,
} from '../src/index';

// =============================================================================
// Collections
// =============================================================================

/**
 * Products Collection
 * Current product catalog (prices and details can change)
 */
const products = mongoCollection('products', {
  _id: objectId().internalId(),
  sku: string(),
  name: string(),
  description: string(),
  price: number(), // Current price (may change over time)
  category: string(),
  inStock: number().int(),
  imageUrl: string().url().optional(),
  updatedAt: date().onUpdateNow(),
});

/**
 * Customers Collection
 * Customer profiles
 */
const customers = mongoCollection('customers', {
  id: publicId('cus'),
  email: string().email(),
  name: string(),
  phone: string().optional(),
  createdAt: date().defaultNow(),
});

/**
 * Orders Collection
 * Order headers with customer snapshot
 */
const orders = mongoCollection(
  'orders',
  {
    _id: objectId().internalId(),
    orderNumber: string(),
    customerId: string(), // Customer publicId

    // Shipping info (snapshot at order time)
    shippingAddress: object({
      street: string(),
      city: string(),
      state: string(),
      zipCode: string(),
      country: string(),
    }),

    // Order details
    status: string(), // 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
    subtotal: number(),
    tax: number(),
    shipping: number(),
    total: number(),

    placedAt: date().defaultNow(),
    updatedAt: date().onUpdateNow(),
  },
  {
    relations: {
      // EMBED: Customer contact info (auto-updates for email/phone changes)
      customer: embed(customers, {
        forward: {
          from: 'customerId',
          projection: { name: 1, email: 1, phone: 1 },
          embedIdField: 'id',
        },
        reverse: {
          enabled: true,
          strategy: 'async',
          // Update customer contact, but NOT if they change their name
          // (orders should preserve customer name at time of purchase)
          watchFields: ['email', 'phone'],
        },
      }),
    },
  }
);

/**
 * Order Items Collection
 * Individual items in an order with product SNAPSHOT
 */
const orderItems = mongoCollection(
  'order_items',
  {
    _id: objectId().internalId(),
    orderId: objectId(),
    productId: objectId(),

    // Purchase details
    quantity: number().int(),
    unitPrice: number(), // Price at time of purchase
    total: number(),

    createdAt: date().defaultNow(),
  },
  {
    relations: {
      // EMBED: Product snapshot (NO auto-update - preserve historical data)
      product: embed(products, {
        forward: {
          from: 'productId',
          projection: { sku: 1, name: 1, description: 1, category: 1, imageUrl: 1 },
        },
        // NO reverse config - we want the snapshot at purchase time!
      }),

      // EMBED: Order info (snapshot)
      order: embed(orders, {
        forward: {
          from: 'orderId',
          projection: { orderNumber: 1, status: 1 },
        },
        // NO auto-update - preserve order state at item creation
      }),
    },
  }
);

// =============================================================================
// ORM Setup
// =============================================================================

const schema = defineSchema({
  products,
  customers,
  orders,
  orderItems,
});

const db = await mizzle({
  uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
  dbName: 'ecommerce_example',
  schema,
});


// =============================================================================
// Example Usage
// =============================================================================

async function main() {
  console.log('🛒 E-Commerce Order System Example\n');

  // ---------------------------------------------------------------------------
  // 1. Create products
  // ---------------------------------------------------------------------------
  console.log('📦 Creating products...');

  const laptop = await db().products.create({
    sku: 'LAPTOP-001',
    name: 'UltraBook Pro 15"',
    description: 'Powerful laptop for professionals',
    price: 1299.99,
    category: 'Electronics',
    inStock: 50,
    imageUrl: 'https://example.com/laptop.jpg',
  });

  const mouse = await db().products.create({
    sku: 'MOUSE-001',
    name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse',
    price: 29.99,
    category: 'Accessories',
    inStock: 200,
  });

  console.log(`✅ Created ${laptop.name} - $${laptop.price}`);
  console.log(`✅ Created ${mouse.name} - $${mouse.price}\n`);

  // ---------------------------------------------------------------------------
  // 2. Create customer
  // ---------------------------------------------------------------------------
  console.log('👤 Creating customer...');

  const customer = await db().customers.create({
    email: 'john@example.com',
    name: 'John Doe',
    phone: '+1-555-0123',
  });

  console.log(`✅ Created customer: ${customer.name} (${customer.id})\n`);

  // ---------------------------------------------------------------------------
  // 3. Place order
  // ---------------------------------------------------------------------------
  console.log('🛍️  Placing order...');

  const subtotal = laptop.price + mouse.price;
  const tax = subtotal * 0.08; // 8% tax
  const shipping = 15.00;
  const total = subtotal + tax + shipping;

  const order = await db().orders.create({
    orderNumber: `ORD-${Date.now()}`,
    customerId: customer.id,
    shippingAddress: {
      street: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
      country: 'USA',
    },
    status: 'pending',
    subtotal,
    tax,
    shipping,
    total,
  });

  console.log(`✅ Created order ${order.orderNumber}`);
  console.log(`   Customer: ${order.customer?.name} (${order.customer?.email})`);
  console.log(`   Total: $${order.total.toFixed(2)}\n`);

  // ---------------------------------------------------------------------------
  // 4. Add order items with product snapshots
  // ---------------------------------------------------------------------------
  console.log('📝 Adding order items...');

  const item1 = await db().orderItems.create({
    orderId: order._id,
    productId: laptop._id,
    quantity: 1,
    unitPrice: laptop.price,
    total: laptop.price,
  });

  const item2 = await db().orderItems.create({
    orderId: order._id,
    productId: mouse._id,
    quantity: 2,
    unitPrice: mouse.price,
    total: mouse.price * 2,
  });

  console.log(`✅ Added item: ${item1.product?.name} x${item1.quantity} @ $${item1.unitPrice}`);
  console.log(`   Product snapshot:`, item1.product);
  console.log(`✅ Added item: ${item2.product?.name} x${item2.quantity} @ $${item2.unitPrice}`);
  console.log(`   Product snapshot:`, item2.product);
  console.log();

  // ---------------------------------------------------------------------------
  // 5. Update product price (should NOT affect order)
  // ---------------------------------------------------------------------------
  console.log('💰 Updating product price...');

  const oldPrice = laptop.price;
  const newPrice = 1399.99;

  await db().products.updateById(laptop._id, {
    price: newPrice,
  });

  console.log(`✅ Updated laptop price: $${oldPrice} → $${newPrice}`);

  // Check order item - should still have OLD price (historical snapshot)
  const itemAfterPriceChange = await db().orderItems.findById(item1._id);
  console.log(`   Order item still shows: $${itemAfterPriceChange?.unitPrice}`);
  console.log(`   Product name: "${itemAfterPriceChange?.product?.name}"`);
  console.log(`   ✅ Historical snapshot preserved!\n`);

  // ---------------------------------------------------------------------------
  // 6. Update customer email (should update order)
  // ---------------------------------------------------------------------------
  console.log('📧 Updating customer email...');

  await db().customers.updateOne(
    { id: customer.id },
    { email: 'john.doe@newmail.com' }
  );

  console.log(`✅ Updated customer email`);

  // Check order - should have NEW email (auto-updated)
  const orderAfterEmailChange = await db().orders.findById(order._id);
  console.log(`   Order now shows: ${orderAfterEmailChange?.customer?.email}`);
  console.log(`   ✅ Contact info auto-updated!\n`);

  // ---------------------------------------------------------------------------
  // 7. Update customer name (should NOT update order)
  // ---------------------------------------------------------------------------
  console.log('👤 Updating customer name...');

  await db().customers.updateOne(
    { id: customer.id },
    { name: 'Jonathan Doe' }
  );

  console.log(`✅ Updated customer name to "Jonathan Doe"`);

  // Check order - should still have OLD name (not in watchFields)
  const orderAfterNameChange = await db().orders.findById(order._id);
  console.log(`   Order still shows: ${orderAfterNameChange?.customer?.name}`);
  console.log(`   ✅ Historical name preserved (not in watchFields)!\n`);

  // ---------------------------------------------------------------------------
  // 8. Display complete order
  // ---------------------------------------------------------------------------
  console.log('📋 Complete Order Details:\n');

  const fullOrder = await db().orders.findById(order._id);
  const items = await db().orderItems.findMany({ orderId: order._id });

  console.log(`  Order: ${fullOrder?.orderNumber}`);
  console.log(`  Status: ${fullOrder?.status}`);
  console.log(`  Customer: ${fullOrder?.customer?.name}`);
  console.log(`  Email: ${fullOrder?.customer?.email}`);
  console.log(`  Phone: ${fullOrder?.customer?.phone}`);
  console.log();
  console.log(`  Shipping Address:`);
  console.log(`    ${fullOrder?.shippingAddress.street}`);
  console.log(`    ${fullOrder?.shippingAddress.city}, ${fullOrder?.shippingAddress.state} ${fullOrder?.shippingAddress.zipCode}`);
  console.log();
  console.log(`  Items:`);

  for (const item of items) {
    console.log(`    • ${item.product?.name} x${item.quantity}`);
    console.log(`      SKU: ${item.product?.sku}`);
    console.log(`      Price: $${item.unitPrice.toFixed(2)} each`);
    console.log(`      Total: $${item.total.toFixed(2)}`);
  }

  console.log();
  console.log(`  Subtotal: $${fullOrder?.subtotal.toFixed(2)}`);
  console.log(`  Tax: $${fullOrder?.tax.toFixed(2)}`);
  console.log(`  Shipping: $${fullOrder?.shipping.toFixed(2)}`);
  console.log(`  ─────────────────────`);
  console.log(`  Total: $${fullOrder?.total.toFixed(2)}\n`);

  // ---------------------------------------------------------------------------
  // 9. Show current vs historical prices
  // ---------------------------------------------------------------------------
  console.log('💡 Price Comparison:\n');

  const currentLaptop = await db().products.findById(laptop._id);

  console.log(`  ${laptop.name}:`);
  console.log(`    Current price: $${currentLaptop?.price.toFixed(2)}`);
  console.log(`    Price at purchase: $${item1.unitPrice.toFixed(2)}`);
  console.log(`    Difference: $${(currentLaptop!.price - item1.unitPrice).toFixed(2)}`);
  console.log();

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('✨ E-Commerce Embed Summary:');
  console.log('  ✅ Product snapshots: Preserve exact purchase-time details');
  console.log('  ✅ Price history: Orders unaffected by price changes');
  console.log('  ✅ Customer contact: Auto-updates for email/phone');
  console.log('  ✅ Customer name: Preserved at order time (historical)');
  console.log('  ✅ Perfect audit trail: See exactly what was ordered');
  console.log();
  console.log('🎉 Example complete!');
}

// Run example
main()
  .then(async () => {
    await db.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
