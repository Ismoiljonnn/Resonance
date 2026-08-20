// Approximate country centroids used to place a user's posts on the globe
// automatically, based on the region they choose in their profile.
const COUNTRIES = [
  ["Algeria", 28.0339, 1.6596],
  ["Argentina", -38.4161, -63.6167],
  ["Armenia", 40.0691, 45.0382],
  ["Australia", -25.2744, 133.7751],
  ["Austria", 47.5162, 14.5501],
  ["Azerbaijan", 40.1431, 47.5769],
  ["Bangladesh", 23.6850, 90.3563],
  ["Belgium", 50.5039, 4.4699],
  ["Brazil", -14.2350, -51.9253],
  ["Canada", 56.1304, -106.3468],
  ["Chile", -35.6751, -71.5430],
  ["China", 35.8617, 104.1954],
  ["Colombia", 4.5709, -74.2973],
  ["Cuba", 21.5218, -77.7812],
  ["Denmark", 56.2639, 9.5018],
  ["Egypt", 26.8206, 30.8025],
  ["Ethiopia", 9.1450, 40.4897],
  ["Finland", 61.9241, 25.7482],
  ["France", 46.2276, 2.2137],
  ["Georgia", 42.3154, 43.3569],
  ["Germany", 51.1657, 10.4515],
  ["Ghana", 7.9465, -1.0232],
  ["Greece", 39.0742, 21.8243],
  ["India", 20.5937, 78.9629],
  ["Indonesia", -0.7893, 113.9213],
  ["Iran", 32.4279, 53.6880],
  ["Iraq", 33.2232, 43.6793],
  ["Ireland", 53.4129, -8.2439],
  ["Israel", 31.0461, 34.8516],
  ["Italy", 41.8719, 12.5674],
  ["Japan", 36.2048, 138.2529],
  ["Kazakhstan", 48.0196, 66.9237],
  ["Kenya", -0.0236, 37.9062],
  ["Kyrgyzstan", 41.2044, 74.7661],
  ["Malaysia", 4.2105, 101.9758],
  ["Mexico", 23.6345, -102.5528],
  ["Mongolia", 46.8625, 103.8467],
  ["Morocco", 31.7917, -7.0926],
  ["Netherlands", 52.1326, 5.2913],
  ["New Zealand", -40.9006, 174.8860],
  ["Nigeria", 9.0820, 8.6753],
  ["North Korea", 40.3399, 127.5101],
  ["Norway", 60.4720, 8.4689],
  ["Pakistan", 30.3753, 69.3451],
  ["Peru", -9.1900, -75.0152],
  ["Philippines", 12.8797, 121.7740],
  ["Poland", 51.9194, 19.1451],
  ["Portugal", 39.3999, -8.2245],
  ["Qatar", 25.3548, 51.1839],
  ["Russia", 61.5240, 105.3188],
  ["Saudi Arabia", 23.8859, 45.0792],
  ["Singapore", 1.3521, 103.8198],
  ["South Africa", -30.5595, 22.9375],
  ["South Korea", 35.9078, 127.7669],
  ["Spain", 40.4637, -3.7492],
  ["Sri Lanka", 7.8731, 80.7718],
  ["Sweden", 60.1282, 18.6435],
  ["Switzerland", 46.8182, 8.2275],
  ["Tajikistan", 38.8610, 71.2761],
  ["Thailand", 15.8700, 100.9925],
  ["Turkey", 38.9637, 35.2433],
  ["Turkmenistan", 38.9697, 59.5563],
  ["Ukraine", 48.3794, 31.1656],
  ["United Arab Emirates", 23.4241, 53.8478],
  ["United Kingdom", 55.3781, -3.4360],
  ["United States", 39.8283, -98.5795],
  ["Uruguay", -32.5228, -55.7658],
  ["Uzbekistan", 41.3775, 64.5853],
  ["Venezuela", 6.4238, -66.5897],
  ["Vietnam", 14.0583, 108.2772],
  ["Other", 20, 10],
];

const COUNTRY_COORDS = Object.fromEntries(COUNTRIES.map(([name, lat, lng]) => [name, { lat, lng }]));

function populateCountrySelect(selectEl) {
  selectEl.innerHTML = '<option value="">Select a country…</option>' +
    COUNTRIES.map(([name]) => `<option value="${name}">${name}</option>`).join('');
}

// Small jitter so multiple users in the same country don't sit on the
// exact same point.
function jitterCoords(lat, lng) {
  const spread = 2.5;
  const j = () => (Math.random() - 0.5) * spread;
  return { lat: lat + j(), lng: lng + j() };
}

// Per-post jitter: slightly offsets a marker so posts from the same
// user (same home coords) don't perfectly overlap on the globe.
function jitterPostCoords(lat, lng) {
  const spread = 0.4;
  const j = () => (Math.random() - 0.5) * spread;
  return { lat: lat + j(), lng: lng + j() };
}
