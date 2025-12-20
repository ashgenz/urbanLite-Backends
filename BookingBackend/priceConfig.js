// // priceConfig.js
// export const UNIT_PRICES = {
//   Monthly: { room: 8, kitchen: 10, hall: 12, toilet: 15, meal: 28.31, naashta: 15, bartan: 2.5 },
//   OneTime: { room: 10, kitchen: 13, hall: 15, toilet: 18, meal: 40,naashta: 20, bartan: 3 },
// };


// backend/priceConfig.js
// backend/priceConfig.js
export const UNIT_PRICES = {
  Monthly: {
    room: 13, kitchen: 15, hall: 15, toilet: 35, bartan: 1.5,
    // ensure 'meal' key is NOT here
  },
  Cleaning_Monthly: { bhk1: 1300, bhk2: 1700, bhk3: 2100, bhk4: 2300 },
  Cook_Monthly: { p1: 2400, p2: 3600, p3: 4600, per_head_bulk: 1400 },
  Cook_Breakfast: { p1: 800, p2: 1050, p3: 1300, p4: 1700, per_head_bulk: 425 },
  Cook_Bartan: { p1: 270, p2: 400, p3: 540, p4: 670, per_head_bulk: 170 }
};