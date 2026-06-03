// Real-provider stub for the 52-week promotional plan + promotion detail
// screen. Replace each method body with a call into the production data
// service (forecaster, deal sheet warehouse, APP/WIMS/Apex/OMS/SSIMS).
//
// Activate by setting PROMO_PLAN_PROVIDER=real in the environment.

function notImplemented(method) {
  throw new Error(`${method} is not implemented in promoPlanRealStore.js. Run with PROMO_PLAN_PROVIDER=mock, or implement this method.`);
}

module.exports = {
  source: "real",
  getPromoPlan: () => notImplemented("getPromoPlan"),
  getPromotionDetail: () => notImplemented("getPromotionDetail"),
  getPromotionDetailOptions: () => notImplemented("getPromotionDetailOptions"),
  getPromotionDetailWorklist: () => notImplemented("getPromotionDetailWorklist"),
  confirmPromotion: () => notImplemented("confirmPromotion"),
  overrideForecast: () => notImplemented("overrideForecast")
};
