// Test harness for orderMatchesDrink logic
// Mirrors the logic in main.js but runs standalone in Node.

function orderMatchesDrink_local(order, selectedSize, selectedFlavor, toppings) {
  if (!order) return false;
  if (!selectedSize || !selectedFlavor) return false;
  if (order.size.key !== selectedSize.key) return false;
  if (order.flavor.key !== selectedFlavor.key) return false;

  const norm = (s) => (s == null) ? '' : String(s).toLowerCase().trim();
  const countMap = (arr) => {
    const m = {};
    (arr || []).forEach(t => {
      const k = norm(t && t.key);
      if (!k) return;
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  };

  const orderCounts = countMap(order.toppings || []);
  const madeCounts = countMap(toppings || []);
  const keys = new Set([...Object.keys(orderCounts), ...Object.keys(madeCounts)]);
  for (const k of keys) {
    if ((orderCounts[k] || 0) !== (madeCounts[k] || 0)) return false;
  }
  return true;
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 2;
  } else {
    console.log('PASS:', msg);
  }
}

// Test cases
const sizes = { Tiny: { key: 'Tiny' }, Small: { key: 'Small' }, Medium: { key: 'Medium' } };
const flavors = { Classic: { key: 'Classic Milk Tea' }, Taro: { key: 'Taro' } };

// 1. exact match
let order = { size: sizes.Medium, flavor: flavors.Classic, toppings: [{key:'Boba'},{key:'Pudding'}] };
let selSize = sizes.Medium;
let selFlavor = flavors.Classic;
let madeToppings = [{key:'Boba'},{key:'Pudding'}];
assert(orderMatchesDrink_local(order, selSize, selFlavor, madeToppings), 'Exact match should succeed');

// 2. toppings in different order
madeToppings = [{key:'Pudding'},{key:'Boba'}];
assert(orderMatchesDrink_local(order, selSize, selFlavor, madeToppings), 'Toppings in different order should succeed');

// 3. extra topping
madeToppings = [{key:'Boba'},{key:'Pudding'},{key:'Mochi'}];
assert(!orderMatchesDrink_local(order, selSize, selFlavor, madeToppings), 'Extra topping should fail');

// 4. missing topping
madeToppings = [{key:'Boba'}];
assert(!orderMatchesDrink_local(order, selSize, selFlavor, madeToppings), 'Missing topping should fail');

// 5. duplicate toppings counts must match
order = { size: sizes.Tiny, flavor: flavors.Taro, toppings: [{key:'Boba'},{key:'Boba'},{key:'Mochi'}] };
selSize = sizes.Tiny; selFlavor = flavors.Taro;
madeToppings = [{key:'Boba'},{key:'Mochi'},{key:'Boba'}];
assert(orderMatchesDrink_local(order, selSize, selFlavor, madeToppings), 'Duplicate toppings counts matching in different order should succeed');

// 6. counts mismatch
madeToppings = [{key:'Boba'},{key:'Mochi'}];
assert(!orderMatchesDrink_local(order, selSize, selFlavor, madeToppings), 'Counts mismatch should fail');

// 7. case and whitespace differences
order = { size: sizes.Small, flavor: flavors.Classic, toppings: [{key:' Boba '},{key:'PUDDING'}] };
selSize = sizes.Small; selFlavor = flavors.Classic;
madeToppings = [{key:'boba'},{key:'pudding'}];
assert(orderMatchesDrink_local(order, selSize, selFlavor, madeToppings), 'Case and whitespace differences should be normalized and succeed');

// 8. size mismatch
order = { size: sizes.Medium, flavor: flavors.Classic, toppings: [] };
selSize = sizes.Small; selFlavor = flavors.Classic; madeToppings = [];
assert(!orderMatchesDrink_local(order, selSize, selFlavor, madeToppings), 'Size mismatch should fail');

// 9. flavor mismatch
order = { size: sizes.Medium, flavor: flavors.Taro, toppings: [] };
selSize = sizes.Medium; selFlavor = flavors.Classic; madeToppings = [];
assert(!orderMatchesDrink_local(order, selSize, selFlavor, madeToppings), 'Flavor mismatch should fail');

console.log('\nAll tests completed.');
