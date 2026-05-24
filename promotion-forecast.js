const categoryPlans = [
  ["Units", "$507K", "103K", "$100K"],
  ["Revenue", "$509K", "90K", "$155K", true],
  ["AGP", "$480K", "75K", "$187K"],
  ["HH", "$509K", "224K", "$155K"]
];

const storePlans = [
  { label: "Units Plan", sales: "$8.42M", units: "1.84M", agp: "$2.21M", promo: "38.2%", depth: "22.0%", deep: "14.5%" },
  { label: "Revenue Plan", sales: "$8.71M", units: "1.62M", agp: "$2.36M", promo: "35.7%", depth: "19.0%", deep: "11.2%" },
  { label: "AGP Plan", sales: "$8.19M", units: "1.48M", agp: "$2.51M", promo: "31.4%", depth: "17.8%", deep: "8.6%" },
  { label: "HH Plan", sales: "$8.66M", units: "1.76M", agp: "$2.29M", promo: "36.5%", depth: "20.4%", deep: "12.1%" },
  { label: "No Promo Plan", sales: "$7.92M", units: "1.31M", agp: "$2.03M", promo: "0.0%", depth: "0.0%", deep: "0.0%", baseline: true },
  { label: "LY Promo Plan", sales: "$8.28M", units: "1.55M", agp: "$2.10M", promo: "34.1%", depth: "18.6%", deep: "10.4%", baseline: true }
];

const scatters = [
  { title: "Opt.Units", selected: false, x: "Delta AGP (pp)", y: "Delta Sales", max: "$29K" },
  { title: "Opt.Revenue", selected: true, x: "Delta AGP (pp)", y: "Delta Units", max: "7.5K" },
  { title: "Opt.AGP", selected: false, x: "Delta Sales (Promo-Base)", y: "Delta Units", max: "6.0K" },
  { title: "Opt.HH", selected: false, x: "Delta AGP (pp)", y: "Delta Sales", max: "$23K" }
];

function scatterDots(seed) {
  return Array.from({ length: 84 }, (_, index) => {
    const base = (index * 37 + seed * 19) % 100;
    const x = 12 + ((base * 5 + index * 9) % 78);
    const trend = seed === 2 ? x * 0.55 : seed === 3 ? Math.sin(index) * 18 + x * 0.45 : x * 0.35;
    const y = Math.max(12, Math.min(86, 82 - trend + ((index * 11) % 32)));
    const shade = 45 + ((index * 13) % 40);
    return `<span style="left:${x}%;top:${y}%;background:hsl(216 84% ${shade}%);"></span>`;
  }).join("");
}

function renderCategoryPlans() {
  document.getElementById("categoryPlanRows").innerHTML = categoryPlans.map(([name, sales, units, agp, selected]) => `
    <tr class="${selected ? "selected" : ""}">
      <td>${name}${selected ? "<span class=\"selected-badge\">Selected</span>" : ""}</td>
      <td>${sales}</td>
      <td>${units}</td>
      <td>${agp}</td>
    </tr>
  `).join("");
}

function renderStorePlans() {
  const maxSales = "$8.71M";
  const maxUnits = "1.84M";
  const maxAgp = "$2.51M";
  document.getElementById("storePlanCards").innerHTML = `
    <div class="store-plan-columns">
      <span></span>
      <span>Sales</span>
      <span>Units</span>
      <span>AGP</span>
    </div>
  ` + storePlans.map((plan) => `
    <article class="${plan.baseline ? "baseline" : ""}">
      <div class="store-plan-row">
        <strong>${plan.label}</strong>
        <span class="${plan.sales === maxSales ? "best" : ""}">${plan.sales}</span>
        <span class="${plan.units === maxUnits ? "best" : ""}">${plan.units}</span>
        <span class="${plan.agp === maxAgp ? "best" : ""}">${plan.agp}</span>
      </div>
      ${plan.promo === "0.0%" ? "" : `<p class="plan-meta">${plan.promo} / ${plan.depth} / ${plan.deep}</p>`}
    </article>
  `).join("");
}

function renderScatters() {
  document.getElementById("scatterGrid").innerHTML = scatters.map((chart, index) => `
    <article class="scatter-card ${chart.selected ? "selected" : ""}">
      <div class="chart-title"><strong>${chart.title}</strong>${chart.selected ? "<span>Selected</span>" : ""}</div>
      <div class="scatter-plot">
        <b class="axis-y">${chart.y}</b>
        <b class="axis-x">${chart.x}</b>
        <em class="zero-v"></em>
        <em class="zero-h"></em>
        ${scatterDots(index + 1)}
      </div>
    </article>
  `).join("");
}

function bindEvents() {
  const overlay = document.getElementById("explainOverlay");
  document.getElementById("openExplain").addEventListener("click", () => overlay.hidden = false);
  document.getElementById("closeExplain").addEventListener("click", () => overlay.hidden = true);
  document.getElementById("closeExplainBottom").addEventListener("click", () => overlay.hidden = true);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.hidden = true;
  });
}

renderCategoryPlans();
renderStorePlans();
renderScatters();
bindEvents();
