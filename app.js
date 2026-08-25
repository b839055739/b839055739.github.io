const state = {
  products: [],
  orders: [],
  admin: null,
  category: "全部",
  search: "",
  adminSearch: "",
  adminSupplier: "all",
  cart: JSON.parse(localStorage.getItem("zhixuanji-cart") || "[]"),
  latestOrder: null,
  adminToken: sessionStorage.getItem("zhixuanji-admin-token") || ""
};

const STATIC_MODE = window.__STATIC_MODE__ === true;
const STATIC_ORDER_KEY = "zhixuanji-static-orders";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
const time = (value) => value ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "--";
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

const icons = {
  writing: '<svg viewBox="0 0 80 80"><path d="M17 62h46M24 54l3-25 23-8 9 9-8 23-27 1Z"></path><path d="m27 29 24 24M39 41l10-10M23 58l7-7"></path></svg>',
  image: '<svg viewBox="0 0 80 80"><rect x="15" y="17" width="50" height="46" rx="2"></rect><circle cx="51" cy="31" r="6"></circle><path d="m18 57 14-16 10 10 7-7 14 15"></path></svg>',
  code: '<svg viewBox="0 0 80 80"><rect x="13" y="17" width="54" height="46" rx="2"></rect><path d="m31 33-8 7 8 7M49 33l8 7-8 7M44 27l-8 27"></path></svg>',
  video: '<svg viewBox="0 0 80 80"><rect x="13" y="21" width="43" height="38" rx="2"></rect><path d="m56 34 11-7v26l-11-7M32 33l12 7-12 7Z"></path></svg>',
  audio: '<svg viewBox="0 0 80 80"><path d="M20 43v-6a20 20 0 0 1 40 0v6"></path><path d="M20 41h7v17h-7a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5ZM60 41h-7v17h7a5 5 0 0 0 5-5v-7a5 5 0 0 0-5-5ZM54 58c0 6-5 8-11 8"></path></svg>',
  research: '<svg viewBox="0 0 80 80"><circle cx="36" cy="36" r="19"></circle><path d="m51 51 15 15M27 31h18M27 38h14M27 45h9"></path></svg>'
};

function toast(message, type = "") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  $("#toastRegion").append(item);
  setTimeout(() => item.remove(), 3200);
}

async function api(url, options = {}) {
  if (STATIC_MODE) return staticApi(url, options);
  const adminHeaders = url.startsWith("/api/admin") && state.adminToken
    ? { "X-Admin-Token": state.adminToken }
    : {};
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...adminHeaders, ...(options.headers || {}) }
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "请求失败");
    error.status = response.status;
    throw error;
  }
  return result;
}

function staticOrders() {
  try { return JSON.parse(localStorage.getItem(STATIC_ORDER_KEY) || "[]"); }
  catch { return []; }
}

function staticApi(url, options = {}) {
  if (url === "/api/bootstrap") {
    return fetch("./catalog.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("商品快照加载失败");
        return response.json();
      })
      .then((snapshot) => ({
        ...snapshot,
        orders: staticOrders().map(({ id, status, total, createdAt, items }) => ({
          id, status, total, createdAt,
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
        }))
      }));
  }

  if (url === "/api/checkout" && (options.method || "GET") === "POST") {
    const body = JSON.parse(options.body || "{}");
    const items = (body.items || []).map((entry) => {
      const product = productById(entry.productId);
      if (!product) throw new Error("部分商品已从快照中移除");
      return {
        productId: product.id,
        title: product.title,
        quantity: entry.quantity,
        unitPrice: product.price,
        subtotal: Number((product.price * entry.quantity).toFixed(2)),
        fulfillment: []
      };
    });
    const order = {
      id: `ZXWEB${Date.now().toString().slice(-10)}`,
      customer: body.customer || "未填写",
      status: "pending_confirmation",
      total: Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)),
      createdAt: new Date().toISOString(),
      items
    };
    localStorage.setItem(STATIC_ORDER_KEY, JSON.stringify([order, ...staticOrders()].slice(0, 50)));
    return Promise.resolve(order);
  }

  if (url.startsWith("/api/orders/")) {
    const id = decodeURIComponent(url.slice("/api/orders/".length));
    const order = staticOrders().find((item) => item.id === id);
    if (!order) return Promise.reject(new Error("本浏览器中没有找到该订单"));
    return Promise.resolve(order);
  }

  return Promise.reject(new Error("GitHub Pages 静态版未提供此后台接口"));
}

function persistCart() {
  localStorage.setItem("zhixuanji-cart", JSON.stringify(state.cart));
}

function productById(id) {
  return state.products.find((product) => product.id === id);
}

function reconcileCart() {
  state.cart = state.cart.filter((item) => productById(item.productId));
  for (const item of state.cart) {
    const product = productById(item.productId);
    item.quantity = Math.min(item.quantity, Math.max(product.stock, 1));
  }
  persistCart();
}

function setView(view) {
  if (STATIC_MODE && view === "admin") view = "store";
  $$(".view").forEach((element) => element.classList.remove("active"));
  $$(".nav-link").forEach((element) => element.classList.toggle("active", element.dataset.view === view));
  $(`#${view}View`).classList.add("active");
  history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "admin") loadAdmin();
  if (view === "orders") renderOrders();
}

function renderCategories() {
  const categories = ["全部", ...new Set(state.products.map((product) => product.category))];
  $("#categoryTabs").innerHTML = categories.map((category) => `<button class="${state.category === category ? "active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
}

function stockInfo(product) {
  if (product.stockStatus === "out_of_stock") return { text: "暂时缺货", className: "out" };
  if (product.stockUnlimited) return { text: "库存充足", className: "" };
  if (product.stockStatus === "low_stock") return { text: `仅余 ${product.stock} 件`, className: "low" };
  return { text: "现货可购", className: "" };
}

function productMedia(product, context = "card") {
  const fallback = `<div class="visual-icon image-fallback">${icons[product.visual] || icons.research}</div>`;
  if (!product.image) return fallback;
  return `<img class="product-image ${context === "cart" ? "cart-product-image" : ""}" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy" decoding="async" data-product-image>${fallback}`;
}

function bindImageFallbacks(root) {
  root.querySelectorAll("[data-product-image]").forEach((image) => {
    image.addEventListener("error", () => image.parentElement.classList.add("image-failed"), { once: true });
  });
}

function renderProducts() {
  const query = state.search.trim().toLowerCase();
  const visible = state.products.filter((product) => {
    const categoryMatch = state.category === "全部" || product.category === state.category;
    const searchMatch = !query || `${product.title} ${product.description} ${product.category}`.toLowerCase().includes(query);
    return categoryMatch && searchMatch;
  });
  $("#productGrid").innerHTML = visible.map((product, index) => {
    const stock = stockInfo(product);
    return `<article class="product-card">
      <div class="product-visual ${product.visual}"><span class="visual-number">${String(index + 1).padStart(2, "0")}</span>${productMedia(product)}</div>
      <div class="product-body">
        <div class="product-meta"><span class="category-label">${escapeHtml(product.category)}</span><span class="stock-label ${stock.className}">${stock.text}</span></div>
        <h3>${escapeHtml(product.title)}</h3><p class="description">${escapeHtml(product.description)}</p>
        <div class="product-footer"><div class="price-block"><small>当前售价</small><strong>${money(product.price)}</strong></div>
          <button class="add-button" data-add="${product.id}" ${product.stock === 0 ? "disabled" : ""} title="加入购物车" aria-label="加入购物车"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg></button></div>
      </div></article>`;
  }).join("");
  bindImageFallbacks($("#productGrid"));
  $("#emptyProducts").classList.toggle("hidden", visible.length > 0);
}

function renderCart() {
  reconcileCart();
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = state.cart.reduce((sum, item) => {
    const product = productById(item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);
  $("#cartCount").textContent = count;
  $("#cartTotal").textContent = money(total);
  $("#checkoutButton").disabled = count === 0;
  $("#cartItems").innerHTML = count === 0
    ? `<div class="cart-empty"><svg viewBox="0 0 24 24"><path d="M3 3h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H6"></path></svg><b>购物车还是空的</b><p>从精选清单里挑一件工具吧。</p></div>`
    : state.cart.map((item) => {
      const product = productById(item.productId);
      return `<div class="cart-item"><div class="cart-thumb">${productMedia(product, "cart")}</div><div><b>${escapeHtml(product.title)}</b><small>${money(product.price)}</small><div class="quantity-control"><button data-qty="-1" data-id="${product.id}">−</button><span>${item.quantity}</span><button data-qty="1" data-id="${product.id}">+</button></div></div><div><b>${money(product.price * item.quantity)}</b><button class="remove-item" data-remove="${product.id}">移除</button></div></div>`;
    }).join("");
  bindImageFallbacks($("#cartItems"));
}

function openCart(open = true) {
  $("#cartDrawer").classList.toggle("open", open);
  $("#drawerBackdrop").classList.toggle("open", open);
}

function openModal(id) {
  $("#modalBackdrop").classList.add("open");
  $$(".modal").forEach((modal) => modal.classList.remove("open"));
  $(id).classList.add("open");
}

function closeModals() {
  $("#modalBackdrop").classList.remove("open");
  $$(".modal").forEach((modal) => modal.classList.remove("open"));
}

function prepareCheckout() {
  if (!state.cart.length) return;
  $("#toastRegion").replaceChildren();
  const rows = state.cart.map((item) => {
    const product = productById(item.productId);
    return `<div class="checkout-row"><span>${escapeHtml(product.title)} × ${item.quantity}</span><b>${money(product.price * item.quantity)}</b></div>`;
  });
  const total = state.cart.reduce((sum, item) => sum + productById(item.productId).price * item.quantity, 0);
  $("#checkoutSummary").innerHTML = rows.join("");
  $("#checkoutTotal").textContent = money(total);
  openCart(false);
  openModal("#checkoutModal");
}

async function placeOrder() {
  const button = $("#placeOrderButton");
  const label = button.querySelector("[data-button-label]");
  button.disabled = true;
  label.textContent = "正在提交订单...";
  try {
    const order = await api("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ customer: $("#customerEmail").value, items: state.cart })
    });
    state.latestOrder = order;
    state.orders.unshift({ id: order.id, status: order.status, total: order.total, createdAt: order.createdAt, itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0) });
    state.cart = [];
    persistCart();
    renderCart();
    const successModal = $("#successModal");
    if (STATIC_MODE) {
      successModal.querySelector(".eyebrow").textContent = "ORDER RECORDED";
      successModal.querySelector("h2").textContent = "订单记录已生成";
      successModal.querySelector(".modal-lead").textContent = "记录保存在当前浏览器中，等待店铺人工核对付款。";
    }
    $("#successOrder").innerHTML = `<div class="success-order-box"><div><span>订单编号</span><b>${order.id}</b></div><div><span>应付金额</span><b>${money(order.total)}</b></div><div><span>交付状态</span><b>${STATIC_MODE ? "等待人工确认" : "已完成"}</b></div></div>`;
    openModal("#successModal");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    label.textContent = "支付完成，提交订单";
  }
}

function renderOrderCard(order) {
  if (STATIC_MODE && order.status === "pending_confirmation") {
    return `<article class="order-card"><div class="order-card-head"><div><h3>${order.id}</h3><small>${time(order.createdAt)} · ${order.itemCount || order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0} 件商品 · ${money(order.total)}</small></div><span class="order-badge">等待确认</span></div><div class="credential-box"><div class="credential"><div><small>静态订单记录</small><code>请保留付款凭证并联系店铺客服核对</code></div></div></div></article>`;
  }
  const details = order.items ? order.items.flatMap((item) => item.fulfillment.map((credential) => `<div class="credential"><div><small>${escapeHtml(item.title)} · ${credential.label}</small><code>${escapeHtml(credential.value)}</code></div><button class="copy-button" data-copy="${escapeHtml(credential.value)}">复制</button></div>`)).join("") : "";
  return `<article class="order-card"><div class="order-card-head"><div><h3>${order.id}</h3><small>${time(order.createdAt)} · ${order.itemCount || order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0} 件商品 · ${money(order.total)}</small></div><span class="order-badge">已交付</span></div>${details ? `<div class="credential-box">${details}</div>` : `<button class="copy-button" data-load-order="${order.id}">查看交付信息</button>`}</article>`;
}

function renderOrders() {
  $("#ordersList").innerHTML = state.orders.length ? state.orders.map(renderOrderCard).join("") : `<div class="empty-state"><b>暂时没有订单</b><p>完成购买后，交付信息会出现在这里。</p></div>`;
}

async function loadOrder(id) {
  try {
    const order = await api(`/api/orders/${encodeURIComponent(id)}`);
    const index = state.orders.findIndex((item) => item.id === order.id);
    if (index >= 0) state.orders[index] = order; else state.orders.unshift(order);
    renderOrders();
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderAdmin() {
  if (!state.admin) return;
  const { stats } = state.admin;
  const metrics = [
    ["在售商品", stats.activeProducts, "个", "M4 5h16v14H4zM8 9h8M8 13h8"],
    ["累计订单", stats.orderCount, "笔", "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4"],
    ["累计营收", money(stats.revenue), "订单数据", "M4 18V9m5 9V5m5 13v-6m5 6V3"],
    ["预计毛利", money(stats.grossProfit), "未计手续费", "M4 16l5-5 4 3 7-8M16 6h4v4"]
  ];
  $("#metricGrid").innerHTML = metrics.map(([label, value, unit, icon]) => `<div class="metric"><span>${label}<svg viewBox="0 0 24 24"><path d="${icon}"></path></svg></span><strong>${value}</strong><small>${unit}</small></div>`).join("");
  const suppliers = state.admin.suppliers;
  $("#adminSupplierFilter").innerHTML = `<option value="all">全部货源</option>${suppliers.map((supplier) => `<option value="${supplier.id}" ${state.adminSupplier === supplier.id ? "selected" : ""}>${escapeHtml(supplier.name)}</option>`).join("")}`;
  $("#adminProductSearch").value = state.adminSearch;
  const query = state.adminSearch.trim().toLowerCase();
  const visibleProducts = state.admin.products.filter((product) => {
    const supplierMatch = state.adminSupplier === "all" || product.supplierId === state.adminSupplier;
    const queryMatch = !query || `${product.title} ${product.upstreamSku} ${product.category}`.toLowerCase().includes(query);
    return supplierMatch && queryMatch;
  });
  $("#adminProductCount").textContent = `${visibleProducts.length} / ${state.admin.products.length} 项`;
  $("#adminProductRows").innerHTML = visibleProducts.map((product) => {
    const supplier = state.admin.suppliers.find((item) => item.id === product.supplierId);
    const stock = stockInfo(product);
    return `<tr data-product-row="${product.id}"><td class="product-cell"><b>${escapeHtml(product.title)}</b><small>${escapeHtml(supplier?.name || "--")} · ${escapeHtml(product.upstreamSku)}</small></td><td class="price-cell"><small>成本 ${money(product.cost)}</small><b>售价 ${money(product.price)}</b></td><td><span class="stock-label ${stock.className}">${product.stockUnlimited ? "充足" : `${product.stock} 件`}</span></td><td><div class="rule-inputs"><input data-field="markupPercent" type="number" min="0" value="${product.markupPercent}"><span>% + ¥</span><input data-field="fixedMarkup" type="number" min="0" value="${product.fixedMarkup}"></div></td><td><label class="toggle"><input type="checkbox" data-active="${product.id}" ${product.active ? "checked" : ""}><i></i></label></td><td><button class="save-rule" data-save="${product.id}" title="保存定价"><svg viewBox="0 0 24 24"><path d="M5 4h12l2 2v14H5zM8 4v6h8V4M8 20v-7h8v7"></path></svg></button></td></tr>`;
  }).join("");
  $("#supplierList").innerHTML = state.admin.suppliers.map((supplier) => {
    const online = supplier.health === "online";
    const healthText = online ? `● 已同步 ${supplier.productCount || 0} 项` : supplier.health === "error" ? "● 同步异常" : "● 等待同步";
    return `<div class="supplier-item"><div class="supplier-head"><b>${escapeHtml(supplier.name)}</b><span class="supplier-health ${online ? "" : "error"}">${healthText}</span></div><p>${escapeHtml(supplier.endpoint)}</p>${supplier.lastError ? `<p class="supplier-error">${escapeHtml(supplier.lastError)}</p>` : ""}<div class="supplier-foot"><span class="mode-pill">${escapeHtml(supplier.mode)}</span><span>${time(supplier.lastSyncAt)}</span></div></div>`;
  }).join("");
  $("#activityList").innerHTML = state.admin.activities.slice(0, 8).map((activity) => `<div class="activity-item"><i class="activity-dot"></i><div><p>${escapeHtml(activity.message)}</p><time>${time(activity.createdAt)}</time></div></div>`).join("");
  $("#adminOrders").innerHTML = state.admin.orders.length ? state.admin.orders.slice(0, 8).map((order) => `<div class="admin-order-row"><b>${order.id}</b><span>${escapeHtml(order.customer)}</span><span>${money(order.total)}</span><small>已交付</small></div>`).join("") : `<div class="cart-empty">暂无订单</div>`;
}

async function loadAdmin(retryLogin = true) {
  try {
    state.admin = await api("/api/admin");
    renderAdmin();
  } catch (error) {
    if (error.status === 401 && retryLogin) {
      const token = window.prompt("请输入管理口令");
      if (token) {
        state.adminToken = token;
        sessionStorage.setItem("zhixuanji-admin-token", token);
        return loadAdmin(false);
      }
      setView("store");
      return;
    }
    if (error.status === 401) {
      state.adminToken = "";
      sessionStorage.removeItem("zhixuanji-admin-token");
    }
    toast(error.message, "error");
  }
}

async function saveProduct(id, patch) {
  try {
    await api(`/api/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    toast("商品设置已保存");
    await Promise.all([loadBootstrap(), loadAdmin()]);
  } catch (error) { toast(error.message, "error"); }
}

async function syncNow() {
  const button = $("#syncButton");
  button.disabled = true;
  $("#adminSyncLabel").textContent = "正在获取供应商快照";
  try {
    const result = await api("/api/admin/sync", { method: "POST" });
    applyCatalogEvent(result);
    await loadAdmin();
    $("#adminSyncLabel").textContent = `新增 ${result.imported} 项，变化 ${result.changes.length - result.imported} 项，失败 ${result.errors.length} 家`;
    toast(result.message);
  } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; }
}

function applyCatalogEvent(event) {
  if (event.products) state.products = event.products;
  $("#lastSync").textContent = `最近更新 ${time(event.syncedAt)}`;
  renderProducts();
  renderCart();
}

async function loadBootstrap() {
  const data = await api("/api/bootstrap");
  state.products = data.products;
  state.orders = data.orders;
  $("#lastSync").textContent = `最近更新 ${time(data.sync.lastSyncAt)}`;
  renderCategories();
  renderProducts();
  renderCart();
}

function bindEvents() {
  $$(".nav-link").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("#categoryTabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    renderCategories(); renderProducts();
  });
  $("#searchInput").addEventListener("input", (event) => { state.search = event.target.value; renderProducts(); });
  $("#searchToggle").addEventListener("click", () => $("#searchInput").focus());
  $("#productGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (!button) return;
    const existing = state.cart.find((item) => item.productId === button.dataset.add);
    const product = productById(button.dataset.add);
    if (existing) existing.quantity = Math.min(existing.quantity + 1, product.stock, 5);
    else state.cart.push({ productId: product.id, quantity: 1 });
    renderCart(); toast(`${product.title} 已加入购物车`);
  });
  $("#cartItems").addEventListener("click", (event) => {
    const quantity = event.target.closest("[data-qty]");
    const remove = event.target.closest("[data-remove]");
    if (quantity) {
      const item = state.cart.find((entry) => entry.productId === quantity.dataset.id);
      const product = productById(quantity.dataset.id);
      item.quantity = Math.max(1, Math.min(5, product.stock, item.quantity + Number(quantity.dataset.qty)));
      renderCart();
    }
    if (remove) { state.cart = state.cart.filter((item) => item.productId !== remove.dataset.remove); renderCart(); }
  });
  $("#cartToggle").addEventListener("click", () => openCart(true));
  $("#cartClose").addEventListener("click", () => openCart(false));
  $("#drawerBackdrop").addEventListener("click", () => openCart(false));
  $("#checkoutButton").addEventListener("click", prepareCheckout);
  $("#modalBackdrop").addEventListener("click", closeModals);
  $$("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModals));
  $("#placeOrderButton").addEventListener("click", placeOrder);
  $("#viewOrderButton").addEventListener("click", () => { closeModals(); setView("orders"); if (state.latestOrder) loadOrder(state.latestOrder.id); });
  $("#ordersList").addEventListener("click", (event) => {
    const load = event.target.closest("[data-load-order]");
    const copy = event.target.closest("[data-copy]");
    if (load) loadOrder(load.dataset.loadOrder);
    if (copy) navigator.clipboard.writeText(copy.dataset.copy).then(() => toast("兑换码已复制"));
  });
  $("#orderLookupButton").addEventListener("click", () => loadOrder($("#orderLookupInput").value.trim()));
  $("#syncButton").addEventListener("click", syncNow);
  $("#adminProductSearch").addEventListener("input", (event) => { state.adminSearch = event.target.value; renderAdmin(); });
  $("#adminSupplierFilter").addEventListener("change", (event) => { state.adminSupplier = event.target.value; renderAdmin(); });
  $("#adminProductRows").addEventListener("click", (event) => {
    const save = event.target.closest("[data-save]");
    if (!save) return;
    const row = save.closest("tr");
    saveProduct(save.dataset.save, {
      markupPercent: Number(row.querySelector('[data-field="markupPercent"]').value),
      fixedMarkup: Number(row.querySelector('[data-field="fixedMarkup"]').value)
    });
  });
  $("#adminProductRows").addEventListener("change", (event) => {
    if (event.target.matches("[data-active]")) saveProduct(event.target.dataset.active, { active: event.target.checked });
  });
}

async function init() {
  document.documentElement.classList.toggle("static-mode", STATIC_MODE);
  bindEvents();
  try {
    await loadBootstrap();
    const allowedViews = STATIC_MODE ? ["store", "orders"] : ["store", "orders", "admin"];
    const initialView = allowedViews.includes(location.hash.slice(1)) ? location.hash.slice(1) : "store";
    setView(initialView);
    if (STATIC_MODE) {
      $(".intro-side > p").textContent = "精选创作、办公与开发工具。当前展示发布时的价格与库存快照，订单记录保存在本浏览器。";
      $(".live-status b").textContent = "商品快照";
      $("#ordersView .page-heading > p").textContent = "保存在当前浏览器中的订单记录";
      $(".cart-footer p").textContent = "价格和库存来自发布时的商品快照";
      $(".payment-note span").textContent = "请按右侧金额付款，并保留付款凭证供人工核对。";
      $("#placeOrderButton [data-button-label]").textContent = "我已付款，保存订单记录";
    } else {
      const events = new EventSource("/api/events");
      events.addEventListener("catalog", (event) => applyCatalogEvent(JSON.parse(event.data)));
      events.onerror = () => { $("#lastSync").textContent = "连接正在恢复"; };
    }
  } catch (error) {
    toast(`启动失败：${error.message}`, "error");
  }
}

init();