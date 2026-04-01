(function(){
  'use strict';

  var APP = 'https://app.zikloapp.com';
  var VERSION = '1.1.0';

  // ── Buscar el contenedor ────────────────────────────────────────────────────
  var container = document.getElementById('ziklo-widget') || document.currentScript && document.currentScript.parentElement;
  if (!container) return;

  // ── Inyectar CSS ────────────────────────────────────────────────────────────
  // Helper: hex (#rrggbb) → rgba string con opacidad
  function hexToRgba(hex, opacity) {
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')';
  }

  // Defaults
  var _accent = '#222222', _bg = '#fafafa', _text = '#111111';

  function buildCss(accent, bg, text) {
    return [
      '#subs-widget{margin:16px 0;padding:16px;border:1.5px solid ' + hexToRgba(text, 0.15) + ';border-radius:10px;background:' + bg + '}',
      '#subs-widget *{box-sizing:border-box}',
      '#subs-widget .subs-tabs{display:grid;grid-template-columns:1fr 1fr;border:1.5px solid ' + hexToRgba(text, 0.18) + ';border-radius:8px;overflow:hidden;margin-bottom:14px}',
      '#subs-widget .subs-tab{padding:12px 8px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;border:none;background:transparent;color:' + text + ';opacity:.55;transition:background .2s,opacity .2s,box-shadow .2s;text-align:center;line-height:1.3}',
      '#subs-widget .subs-tab:first-child{border-right:1.5px solid ' + hexToRgba(text, 0.18) + '}',
      '#subs-widget .subs-tab.active{background:' + hexToRgba(text, 0.06) + ';opacity:1;box-shadow:inset 0 -2.5px 0 ' + accent + '}',
      '#subs-widget .subs-tab:hover:not(.active){opacity:.75;background:' + hexToRgba(text, 0.03) + '}',
      '#subs-widget .subs-tab-badge{display:inline-block;font-size:10px;font-weight:700;background:' + accent + ';color:' + bg + ';padding:2px 8px;border-radius:20px;margin-left:5px;vertical-align:middle;letter-spacing:.02em}',
      '#subs-widget .subs-panel{display:none;padding-top:4px}',
      '#subs-widget .subs-panel.visible{display:block}',
      '#subs-widget .subs-precio-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}',
      '#subs-widget .subs-precio-original{font-size:13px;text-decoration:line-through;color:' + hexToRgba(text, 0.4) + '}',
      '#subs-widget .subs-precio-final{font-size:18px;font-weight:700;color:' + text + '}',
      '#subs-widget .subs-ahorro-badge{font-size:11px;font-weight:700;background:' + hexToRgba(accent, 0.12) + ';color:' + accent + ';padding:3px 10px;border-radius:20px}',
      '#subs-widget .subs-freq-title{font-size:12px;font-weight:600;color:' + hexToRgba(text, 0.6) + ';margin-bottom:8px}',
      '#subs-widget .subs-chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px}',
      '#subs-widget .subs-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500;padding:7px 13px;border-radius:999px;border:1px solid ' + hexToRgba(text, 0.13) + ';background:' + bg + ';color:' + hexToRgba(text, 0.6) + ';box-shadow:0 1px 2px rgba(0,0,0,.04)}',
      '#subs-widget .subs-chip-icon{display:inline-flex;font-size:13px;opacity:.6}',
      '#subs-widget .subs-no-price{font-size:12px;color:' + hexToRgba(text, 0.4) + ';font-style:italic;margin-bottom:10px}',
    ].join('');
  }

  var css = buildCss(_accent, _bg, _text);

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── Inyectar HTML ───────────────────────────────────────────────────────────
  var widget = document.createElement('div');
  widget.id = 'subs-widget';
  widget.style.margin = '16px 0';
  widget.innerHTML = [
    '<div class="subs-tabs">',
      '<button class="subs-tab active" id="subs-tab-unica">Compra única</button>',
      '<button class="subs-tab" id="subs-tab-sub">Suscribirse y ahorrar <span class="subs-tab-badge" id="subs-badge-pct">10% OFF</span></button>',
    '</div>',
    '<div class="subs-panel" id="subs-panel">',
      '<div class="subs-precio-row">',
        '<span class="subs-precio-original" id="subs-p-original"></span>',
        '<span class="subs-precio-final" id="subs-p-final"></span>',
        '<span class="subs-ahorro-badge" id="subs-ahorro-badge"></span>',
      '</div>',
      '<div class="subs-freq-title">Tu pedido llega solo, cada mes.</div>',
      '<div class="subs-chips" id="subs-chips">',
        '<span class="subs-chip"><span class="subs-chip-icon">&#x1F4E6;</span> Entrega mensual</span>',
        '<span class="subs-chip"><span class="subs-chip-icon">&#x1F4B2;</span> Precio fijo</span>',
        '<span class="subs-chip"><span class="subs-chip-icon">&#x1F69A;</span> Envio incluido</span>',
        '<span class="subs-chip"><span class="subs-chip-icon">&times;</span> Cancel\u00e1 cuando quieras</span>',
      '</div>',
    '</div>',
  ].join('');

  container.parentNode.insertBefore(widget, container.nextSibling);

  // Wire up tab buttons
  document.getElementById('subs-tab-unica').onclick = function(){ subsTab('unica'); };
  document.getElementById('subs-tab-sub').onclick   = function(){ subsTab('sub'); };

  // ── Lógica del widget ───────────────────────────────────────────────────────
  var BENEFIT_TYPE  = 'discount';
  var BENEFIT_VALUE = '10';
  var DESCUENTO     = 0.10;
  var precioActual  = 0;
  var modoSub       = false;
  var _widgetBtnText = 'Confirmar suscripción mensual';

  var PRICE_SELECTORS = [
    '.price__sale .price-item--sale',
    '.price--main .price-item--sale',
    '.price-item--sale',
    '.price__regular .price-item--regular',
    '[data-product-price]',
    '.price-item--regular',
  ];

  var ATC_SELECTORS = [
    '.product-form__submit',
    'button[name="add"]',
    'form[action="/cart/add"] button[type="submit"]',
    'form[action*="/cart/add"] button[type="submit"]',
  ];

  function parsePrecio(text) {
    var limpio = text.replace(/[^0-9,\.]/g, '');
    if (!limpio) return 0;
    var lastComma = limpio.lastIndexOf(',');
    var lastDot   = limpio.lastIndexOf('.');
    if (lastComma > lastDot) { limpio = limpio.replace(/\./g, '').replace(',', '.'); }
    else                     { limpio = limpio.replace(/,/g, ''); }
    return parseFloat(limpio) || 0;
  }

  function leerPrecioDelCardSeleccionado() {
    var checked = document.querySelector('input[type="radio"]:checked');
    if (checked) {
      var node = checked.parentElement;
      for (var i = 0; i < 4; i++) {
        if (!node) break;
        var priceEl = node.querySelector('[class*="price"]:not([class*="compare"]):not([class*="was"]):not(s):not(del)');
        if (priceEl) { var p = parsePrecio(priceEl.textContent); if (p > 100) return p; }
        node = node.parentElement;
      }
    }
    return 0;
  }

  function leerPrecio() {
    var p = leerPrecioDelCardSeleccionado();
    if (p > 0) return p;
    for (var i = 0; i < PRICE_SELECTORS.length; i++) {
      var el = document.querySelector(PRICE_SELECTORS[i]);
      if (el && el.textContent.trim()) { p = parsePrecio(el.textContent); if (p > 100) return p; }
    }
    return 0;
  }

  function formatPrecio(num) { return '$' + Math.round(num).toLocaleString('es-AR'); }

  function actualizarPrecioSub(precio) {
    if (!precio) return;
    if (BENEFIT_TYPE === 'discount') {
      var precioSub = Math.round(precio * (1 - DESCUENTO));
      var ahorro    = Math.round(precio * DESCUENTO);
      var pct       = Math.round(DESCUENTO * 100);
      document.getElementById('subs-p-original').textContent  = formatPrecio(precio);
      document.getElementById('subs-p-final').textContent     = formatPrecio(precioSub) + '/mes';
      document.getElementById('subs-ahorro-badge').textContent = 'Ahorrás ' + formatPrecio(ahorro);
      document.getElementById('subs-badge-pct').textContent   = pct + '% OFF';
    }
  }

  function actualizarWidget(precio) {
    if (precio === precioActual) return;
    precioActual = precio;
    if (modoSub) actualizarPrecioSub(precio);
  }

  function intentarActualizar() { actualizarWidget(leerPrecio()); }

  function getAtcBtn() {
    for (var i = 0; i < ATC_SELECTORS.length; i++) {
      var el = document.querySelector(ATC_SELECTORS[i]);
      if (el) return el;
    }
    return null;
  }

  var atcOriginalHTML = null;
  var atcOriginalStyle = null;

  function getBuyNowBtn() {
    return document.querySelector('.shopify-payment-button, .dynamic-checkout__buttons, [data-shopify="dynamic-checkout-cart"]');
  }

  function setAtcModeSuscripcion() {
    var btn = getAtcBtn();
    if (!btn) return;
    if (!atcOriginalHTML) atcOriginalHTML = btn.innerHTML;
    if (!atcOriginalStyle) atcOriginalStyle = btn.getAttribute('style') || '';
    btn.innerHTML = _widgetBtnText;
    btn.style.backgroundColor = _accent;
    btn.style.color = _bg;
    var buyNow = getBuyNowBtn();
    if (buyNow) buyNow.style.display = 'none';
  }

  function setAtcModeNormal() {
    var btn = getAtcBtn();
    if (!btn || !atcOriginalHTML) return;
    btn.innerHTML = atcOriginalHTML;
    btn.setAttribute('style', atcOriginalStyle || '');
    var buyNow = getBuyNowBtn();
    if (buyNow) buyNow.style.display = '';
  }

  function subsTab(tab) {
    modoSub = (tab === 'sub');
    document.getElementById('subs-tab-unica').classList.toggle('active', !modoSub);
    document.getElementById('subs-tab-sub').classList.toggle('active', modoSub);
    document.getElementById('subs-panel').classList.toggle('visible', modoSub);
    if (modoSub) { actualizarPrecioSub(precioActual); setAtcModeSuscripcion(); }
    else         { setAtcModeNormal(); }
  }

  function hookProductForm() {
    var form = document.querySelector('form[action*="/cart/add"], form[action="/cart/add"]');
    if (!form) return;
    form.addEventListener('submit', function(e) {
      if (!modoSub) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      iniciarSub();
    }, true);
  }

  function iniciarSub() {
    if (!precioActual) { alert('Seleccioná una cantidad de productos primero'); return; }
    var precioSub = BENEFIT_TYPE === 'discount' ? Math.round(precioActual * (1 - DESCUENTO)) : precioActual;
    var form      = document.querySelector('form[action*="/cart/add"]');
    var variantId = form ? (form.querySelector('[name="id"]') || {}).value || '' : '';
    var qty       = form ? (form.querySelector('[name="quantity"]') || {}).value || '1' : '1';
    var checkedCard = document.querySelector('input[type="radio"]:checked');
    var desc = 'Suscripción mensual';
    if (checkedCard) {
      var card = checkedCard.closest('li, [class*="bundle"], [class*="option"]');
      if (card) { var nameEl = card.querySelector('[class*="title"], [class*="name"], strong, b'); if (nameEl && nameEl.textContent.trim()) desc = nameEl.textContent.trim(); }
    }
    var btn = getAtcBtn();
    if (btn) { btn.disabled = true; btn.innerHTML = 'Redirigiendo...'; }
    var url = APP + '/subs-checkout/?'
      + 'monto='     + encodeURIComponent(precioSub)
      + '&desc='     + encodeURIComponent(desc)
      + '&variantId='+ encodeURIComponent(variantId)
      + '&qty='      + encodeURIComponent(qty)
      + '&store='    + encodeURIComponent(document.title.replace(/ [-–|].*/, '').trim())
      + '&shop='     + encodeURIComponent(window.location.hostname);
    if (window._planBeneficios) url += '&beneficios=' + encodeURIComponent(window._planBeneficios);
    window.location.href = url;
  }

  document.addEventListener('change', function(e) {
    if (e.target.closest && e.target.closest('#subs-widget')) return;
    if (e.target.type === 'radio' || e.target.tagName === 'SELECT') { setTimeout(intentarActualizar, 50); setTimeout(intentarActualizar, 250); }
  });

  document.addEventListener('click', function(e) {
    if (e.target.closest && e.target.closest('#subs-widget')) return;
    setTimeout(intentarActualizar, 100); setTimeout(intentarActualizar, 350);
  });

  function observarPrecio() {
    var c = document.querySelector('.product, .product-info, #product-info, [class*="product__info"], main, #MainContent');
    if (!c) return;
    new MutationObserver(intentarActualizar).observe(c, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','data-price','value'] });
  }

  function init() {
    var p = leerPrecio();
    if (p > 0) actualizarWidget(p);
    observarPrecio();
    hookProductForm();
  }

  // ── Aplicar config dinámica ─────────────────────────────────────────────────
  function aplicarWidgetTitle(title) {
    if (!title) return;
    var tabBtn = document.getElementById('subs-tab-sub');
    if (!tabBtn) return;
    var badge = tabBtn.querySelector('.subs-tab-badge');
    tabBtn.textContent = title + ' ';
    if (badge) tabBtn.appendChild(badge);
  }

  var CHIP_DEFAULTS = ['\u{1F4E6} Entrega mensual', '\u{1F4B2} Precio fijo', '\u{1F69A} Envio incluido', '\u00D7 Cancel\u00e1 cuando quieras'];

  function aplicarWidgetChips(chipsJson) {
    var chips;
    try { chips = JSON.parse(chipsJson); } catch(e) { return; }
    if (!Array.isArray(chips) || chips.length === 0) return;
    var c = document.getElementById('subs-chips');
    if (!c) return;
    c.innerHTML = '';
    for (var i = 0; i < 4; i++) {
      var text = (chips[i] && chips[i].trim()) ? chips[i].trim() : CHIP_DEFAULTS[i];
      var span = document.createElement('span');
      span.className = 'subs-chip';
      span.textContent = text;
      c.appendChild(span);
    }
  }

  function aplicarBeneficio(benefitType, benefitValue) {
    BENEFIT_TYPE  = benefitType  || 'discount';
    BENEFIT_VALUE = benefitValue || '10';
    DESCUENTO     = BENEFIT_TYPE === 'discount' ? (parseFloat(BENEFIT_VALUE) || 10) / 100 : 0;
    var badgeEl   = document.getElementById('subs-badge-pct');
    var precioRow = document.getElementById('subs-panel') ? document.getElementById('subs-panel').querySelector('.subs-precio-row') : null;
    if (BENEFIT_TYPE === 'discount') {
      if (badgeEl)   badgeEl.textContent = Math.round(DESCUENTO * 100) + '% OFF';
      if (precioRow) precioRow.style.display = '';
    } else {
      if (precioRow) precioRow.style.display = 'none';
      var badgeLabels = { gift: 'REGALO', free_shipping: 'ENVÍO GRATIS' };
      if (badgeEl) badgeEl.textContent = badgeLabels[BENEFIT_TYPE] || BENEFIT_TYPE.toUpperCase();
      var benefitChipId = 'subs-benefit-chip';
      var existing = document.getElementById(benefitChipId);
      if (!existing) {
        var chip = document.createElement('div');
        chip.id = benefitChipId; chip.className = 'subs-precio-row';
        chip.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:10px';
        var panel = document.getElementById('subs-panel');
        if (panel && precioRow) panel.insertBefore(chip, precioRow.nextSibling);
        existing = chip;
      }
      var chipTexts = { gift: '🎁 Con cada entrega recibís: ' + (BENEFIT_VALUE || ''), free_shipping: '🚚 Cada entrega incluye envío gratis' };
      existing.textContent = chipTexts[BENEFIT_TYPE] || BENEFIT_VALUE;
    }
  }

  // ── Aplicar colores custom del merchant ───────────────────────────────────
  function aplicarWidgetColors(accent, bg, text) {
    _accent = accent || _accent;
    _bg     = bg     || _bg;
    _text   = text   || _text;
    style.textContent = buildCss(_accent, _bg, _text);
    if (modoSub) {
      var btn = getAtcBtn();
      if (btn) { btn.style.backgroundColor = _accent; btn.style.color = _bg; }
    }
  }

  // ── Verificar si producto tiene suscripciones activas ─────────────────────
  function getProductId() {
    try {
      if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product)
        return String(window.ShopifyAnalytics.meta.product.id);
      if (window.meta && window.meta.product && window.meta.product.id)
        return String(window.meta.product.id);
    } catch(e) {}
    return null;
  }

  var shopDomain = window.location.hostname;
  var productId  = getProductId();

  function hideWidget() { var w = document.getElementById('subs-widget'); if (w) w.style.display = 'none'; }

  if (productId) {
    fetch(APP + '/api/products/check?shop=' + encodeURIComponent(shopDomain) + '&productId=' + encodeURIComponent(productId))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.enabled) { hideWidget(); return; }
        aplicarBeneficio(data.benefitType, data.benefitValue);
        if (data.widgetTitle)   aplicarWidgetTitle(data.widgetTitle);
        if (data.widgetChipsVisible === false) {
          var chipsEl = document.getElementById('subs-chips');
          if (chipsEl) chipsEl.style.display = 'none';
        } else if (data.widgetChips) {
          aplicarWidgetChips(data.widgetChips);
        }
        if (data.widgetBtnText) _widgetBtnText = data.widgetBtnText.trim();
        if (data.widgetAccentColor || data.widgetBgColor || data.widgetTextColor)
          aplicarWidgetColors(data.widgetAccentColor, data.widgetBgColor, data.widgetTextColor);
        if (data.beneficios)    window._planBeneficios = data.beneficios;
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
        else { init(); }
      })
      .catch(hideWidget);
  } else {
    hideWidget();
  }
})();
