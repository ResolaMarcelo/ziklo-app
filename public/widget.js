(function(){
  'use strict';

  var APP = 'https://app.zikloapp.com';
  var VERSION = '2.0.0';

  // ── Buscar el contenedor ────────────────────────────────────────────────────
  // Capturar referencia al parent del script inline (se pierde después del IIFE)
  var _scriptParent = null;
  if (document.currentScript && document.currentScript.parentElement
      && document.currentScript.parentElement.tagName !== 'HEAD'
      && document.currentScript.parentElement.tagName !== 'BODY') {
    _scriptParent = document.currentScript.parentElement;
  }

  function buscarContainer() {
    // 1. Div explícito colocado por el merchant (Shopify custom liquid / manual)
    var c = document.getElementById('ziklo-widget');
    // 2. Script inline dentro del theme (Shopify)
    if (!c) c = _scriptParent;
    // 3. Fallback: buscar el botón de agregar al carrito y subir a su form
    if (!c) {
      var _atcBtn = document.querySelector('input[type="submit"][value*="arrito"], button[type="submit"][class*="addtocart"], .js-addtocart, .btn-add-to-cart, button[class*="add-to-cart"]');
      if (_atcBtn) {
        var _form = _atcBtn.closest ? _atcBtn.closest('form') : null;
        c = _form || _atcBtn.parentElement;
      }
    }
    // 4. Selectores comunes de forms de producto
    if (!c) {
      var _selectors = [
        'form[action*="/comprar"]', 'form[action*="/cart"]', 'form[action*="/carrito"]',
        '#product_form', '.js-product-form', 'form.product-form',
        '.js-product-detail', '.product-detail',
      ];
      for (var i = 0; i < _selectors.length; i++) {
        var el = document.querySelector(_selectors[i]);
        if (el) { c = el; break; }
      }
    }
    return c;
  }

  var container = buscarContainer();
  if (!container) return;

  // ── Defaults ────────────────────────────────────────────────────────────────
  var BENEFIT_TYPE  = 'discount';
  var BENEFIT_VALUE = '10';
  var DESCUENTO     = 0.10;
  var precioActual  = 0;

  var CHIP_DEFAULTS = ['\u{1F4E6} Entrega mensual', '\u{1F4B2} Precio fijo', '\u{1F69A} Envio incluido', '× Cancelá cuando quieras'];
  var BTN_DEFAULT   = 'Confirmar suscripción mensual';
  var TITLE_DEFAULT = 'Suscribirse y ahorrar';

  var _accent = '#222222', _bg = '#fafafa', _text = '#111111';

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function hexToRgba(hex, opacity) {
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')';
  }

  // ── Inyectar CSS ────────────────────────────────────────────────────────────
  function buildCss(accent, bg, text) {
    var border = hexToRgba(text, 0.15);
    var borderChip = hexToRgba(text, 0.1);
    return [
      '#zk-banner{width:100%;max-width:100%;margin:16px 0;box-sizing:border-box}',
      '#zk-banner *{box-sizing:border-box;margin:0;padding:0}',
      '#zk-banner .zk-card{background:' + bg + ';border-radius:10px;border:1.5px solid ' + hexToRgba(accent, 0.3) + ';padding:0;position:relative;overflow:hidden;font-family:inherit;color:' + text + '}',
      '#zk-banner .zk-accent-bar{height:3px;background:' + accent + '}',
      '#zk-banner .zk-header{display:flex;align-items:center;gap:10px;padding:14px 16px 0}',
      '#zk-banner .zk-badge{display:inline-block;font-size:10px;font-weight:700;background:' + accent + ';color:' + bg + ';padding:2px 8px;border-radius:20px;letter-spacing:.02em;flex-shrink:0}',
      '#zk-banner .zk-title{font-weight:700;font-size:13.5px;line-height:1.35;flex:1}',
      '#zk-banner .zk-price-section{padding:10px 16px 0}',
      '#zk-banner .zk-prices{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}',
      '#zk-banner .zk-price-final{font-weight:800;font-size:22px;letter-spacing:-0.02em;line-height:1}',
      '#zk-banner .zk-price-period{font-weight:500;font-size:13px;opacity:.5}',
      '#zk-banner .zk-price-original{font-size:13px;text-decoration:line-through;opacity:.35}',
      '#zk-banner .zk-ahorro-badge{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:' + hexToRgba(accent, 0.12) + ';color:' + accent + '}',
      '#zk-banner .zk-benefit-text{font-size:14px;font-weight:600;padding:10px 16px 0}',
      '#zk-banner .zk-freq{font-size:12px;font-weight:600;opacity:.6;padding:8px 16px 0}',
      '#zk-banner .zk-chips{display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px 0}',
      '#zk-banner .zk-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;padding:5px 10px;border-radius:999px;border:1px solid ' + borderChip + ';opacity:.65;line-height:1}',
      '#zk-banner .zk-cta-wrap{padding:14px 16px 14px}',
      '#zk-banner .zk-cta{display:block;width:100%;padding:13px 16px;background:' + accent + ';color:' + bg + ';border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;text-align:center;text-decoration:none;transition:opacity .15s,transform .1s;font-family:inherit;letter-spacing:.01em;line-height:1;-webkit-appearance:none}',
      '#zk-banner .zk-cta:hover{opacity:.9}',
      '#zk-banner .zk-cta:active{transform:scale(.985)}',
      '#zk-banner .zk-cta:disabled{opacity:.45;cursor:wait}',
      '@media(max-width:600px){#zk-banner .zk-header{padding:12px 14px 0}#zk-banner .zk-title{font-size:13px}#zk-banner .zk-price-section{padding:8px 14px 0}#zk-banner .zk-price-final{font-size:20px}#zk-banner .zk-chips{padding:8px 14px 0;gap:5px}#zk-banner .zk-chip{font-size:10.5px;padding:4px 8px}#zk-banner .zk-cta-wrap{padding:12px 14px 12px}#zk-banner .zk-cta{padding:14px 16px;border-radius:10px}#zk-banner .zk-freq{padding:6px 14px 0}#zk-banner .zk-benefit-text{padding:8px 14px 0}}',
    ].join('');
  }

  var styleEl = document.createElement('style');
  styleEl.textContent = buildCss(_accent, _bg, _text);
  document.head.appendChild(styleEl);

  // ── Inyectar HTML (banner) ──────────────────────────────────────────────────
  var banner = document.createElement('div');
  banner.id = 'zk-banner';
  banner.style.margin = '0';
  banner.style.display = 'none';
  banner.innerHTML = [
    '<div class="zk-card">',
      '<div class="zk-accent-bar"></div>',
      '<div class="zk-header">',
        '<span class="zk-title" id="zk-title">' + TITLE_DEFAULT + '</span>',
        '<span class="zk-badge" id="zk-badge">10% OFF</span>',
      '</div>',
      '<div class="zk-price-section" id="zk-price-section">',
        '<div class="zk-prices">',
          '<span class="zk-price-final" id="zk-price-final"></span>',
          '<span class="zk-price-original" id="zk-price-original"></span>',
          '<span class="zk-ahorro-badge" id="zk-ahorro-badge"></span>',
        '</div>',
      '</div>',
      '<div class="zk-benefit-text" id="zk-benefit-text" style="display:none"></div>',
      '<div class="zk-freq" id="zk-freq">Tu pedido llega solo, cada mes.</div>',
      '<div class="zk-chips" id="zk-chips"></div>',
      '<div class="zk-cta-wrap">',
        '<button class="zk-cta" id="zk-cta">' + BTN_DEFAULT + '</button>',
      '</div>',
    '</div>',
  ].join('');

  // ── Insertar / re-insertar banner (resiliente a otras apps que modifiquen el DOM)
  var _bannerRemovido = 0;

  function insertarBanner() {
    // Si ya está en el DOM Y es visible, no hacer nada
    if (banner.parentNode && document.body.contains(banner)) {
      // Verificar que no esté oculto por CSS de otra app (overflow:hidden, etc)
      var rect = banner.getBoundingClientRect();
      if (rect.height > 0) return true;
      // Está en el DOM pero invisible — removerlo y re-insertar afuera
      banner.parentNode.removeChild(banner);
    }

    var c = buscarContainer();
    if (c) container = c;
    if (!container) return false;

    // SIEMPRE insertar DESPUÉS del form (como sibling), nunca adentro.
    // Otras apps (bundles, etc.) aplican CSS al form que oculta nuestro banner.
    var _form = container.tagName === 'FORM' ? container
              : document.querySelector('form.js-product-form, form[action*="/comprar"], form[action*="/cart/add"]');

    if (_form && _form.parentNode && document.body.contains(_form)) {
      _form.parentNode.insertBefore(banner, _form.nextSibling);
      return true;
    }

    // Fallback: después del container (Shopify u otros)
    if (container.parentNode) {
      container.parentNode.insertBefore(banner, container.nextSibling);
      return true;
    }
    return false;
  }
  insertarBanner();

  // ── Detectar precio ─────────────────────────────────────────────────────────
  var PRICE_SELECTORS = [
    // Shopify
    '.price__sale .price-item--sale',
    '.price--main .price-item--sale',
    '.price-item--sale',
    '.price__regular .price-item--regular',
    '[data-product-price]',
    '.price-item--regular',
    // Tiendanube
    '#price_display',
    '.js-price-display',
    '.product-price',
    '[data-price]',
    '.price-container .price',
    '.js-product-price',
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

  function formatPrecio(num) { return '$' + Math.round(num).toLocaleString('es-AR'); }

  function leerPrecioDelCardSeleccionado() {
    var checked = document.querySelector('input[type="radio"]:checked');
    if (!checked) return 0;

    // Encontrar el contenedor de la opción seleccionada (label, li, div)
    var card = checked.closest
      ? (checked.closest('label, li, [class*="option"], [class*="bundle"], [class*="wigy"]') || checked.parentElement)
      : checked.parentElement;
    // Si el card es muy chico, subir hasta encontrar uno que tenga texto de precio
    if (card === checked || card === checked.parentElement) {
      var _n = checked.parentElement;
      for (var i = 0; i < 5 && _n; i++) {
        if (_n.textContent && _n.textContent.match(/\$[\d.,]/)) { card = _n; break; }
        _n = _n.parentElement;
      }
    }
    if (!card) return 0;

    // Método 1: buscar elementos con clase "price" (Shopify themes)
    var priceEl = card.querySelector('[class*="price"]:not([class*="compare"]):not([class*="was"]):not(s):not(del)');
    if (priceEl) { var p1 = parsePrecio(priceEl.textContent); if (p1 > 100) return p1; }

    // Método 2: clonar card, quitar precios tachados, buscar el precio actual
    // Funciona con bundles (Wigy, etc.) que no usan clases "price"
    var clone = card.cloneNode(true);
    var strikes = clone.querySelectorAll('s, del, strike');
    for (var j = 0; j < strikes.length; j++) {
      if (strikes[j].parentNode) strikes[j].parentNode.removeChild(strikes[j]);
    }
    var text = clone.textContent || '';
    var matches = text.match(/\$\s*[\d.,]+/g);
    if (matches) {
      // Tomar el último precio (el precio actual suele estar después del label)
      for (var k = matches.length - 1; k >= 0; k--) {
        var p2 = parsePrecio(matches[k]);
        if (p2 > 100) return p2;
      }
    }

    return 0;
  }

  function leerCantidad() {
    var qtyInput = document.querySelector('input[name="quantity"], .js-quantity input, .quantity input');
    if (qtyInput) { var v = parseInt(qtyInput.value, 10); if (v > 0) return v; }
    return 1;
  }

  function leerPrecio() {
    var p = leerPrecioDelCardSeleccionado();
    if (p <= 0) {
      for (var i = 0; i < PRICE_SELECTORS.length; i++) {
        var el = document.querySelector(PRICE_SELECTORS[i]);
        if (el && el.textContent.trim()) { p = parsePrecio(el.textContent); if (p > 100) break; }
      }
    }
    if (p <= 0) return 0;
    return p * leerCantidad();
  }

  function actualizarBanner(precio) {
    if (!precio) return;
    if (precio === precioActual) return;
    precioActual = precio;
    if (BENEFIT_TYPE === 'discount') {
      var precioSub = Math.round(precio * (1 - DESCUENTO));
      var ahorro    = Math.round(precio * DESCUENTO);
      var pct       = Math.round(DESCUENTO * 100);
      document.getElementById('zk-price-final').innerHTML      = formatPrecio(precioSub) + '<span class="zk-price-period">/mes</span>';
      document.getElementById('zk-price-original').textContent  = formatPrecio(precio);
      document.getElementById('zk-ahorro-badge').textContent    = 'Ahorrás ' + formatPrecio(ahorro);
      document.getElementById('zk-badge').textContent           = pct + '% OFF';
      document.getElementById('zk-price-section').style.display = '';
      document.getElementById('zk-benefit-text').style.display  = 'none';
    }
  }

  function intentarActualizar() { actualizarBanner(leerPrecio()); }

  // ── CTA: iniciar suscripción ────────────────────────────────────────────────
  function iniciarSub() {
    if (!precioActual) { alert('Seleccioná una cantidad de productos primero'); return; }
    var precioSub = BENEFIT_TYPE === 'discount' ? Math.round(precioActual * (1 - DESCUENTO)) : precioActual;
    var form      = document.querySelector('form[action*="/cart/add"]')
                 || document.querySelector('form[action*="/comprar"]')
                 || document.querySelector('form[action*="/cart"]')
                 || document.querySelector('form[action*="/carrito"]');
    var variantId = form ? (form.querySelector('[name="id"]') || form.querySelector('[name="variation"]') || {}).value || '' : '';
    var qty       = form ? (form.querySelector('[name="quantity"]') || {}).value || '1' : '1';
    var checkedCard = document.querySelector('input[type="radio"]:checked');
    var desc = 'Suscripción mensual';
    if (checkedCard) {
      var card = checkedCard.closest('li, [class*="bundle"], [class*="option"]');
      if (card) { var nameEl = card.querySelector('[class*="title"], [class*="name"], strong, b'); if (nameEl && nameEl.textContent.trim()) desc = nameEl.textContent.trim(); }
    }
    var btn = document.getElementById('zk-cta');
    if (btn) { btn.disabled = true; btn.textContent = 'Redirigiendo...'; }
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

  document.getElementById('zk-cta').addEventListener('click', iniciarSub);

  // ── Observar cambios de bundle y cantidad ────────────────────────────────────
  document.addEventListener('change', function(e) {
    if (e.target.closest && e.target.closest('#zk-banner')) return;
    // Reaccionar a radios, selects Y cambios de cantidad
    if (e.target.type === 'radio' || e.target.tagName === 'SELECT' || e.target.name === 'quantity') {
      precioActual = 0; // forzar recálculo
      setTimeout(intentarActualizar, 50);
      setTimeout(intentarActualizar, 250);
    }
  });

  document.addEventListener('input', function(e) {
    if (e.target.closest && e.target.closest('#zk-banner')) return;
    if (e.target.name === 'quantity' || (e.target.type === 'number')) {
      precioActual = 0;
      setTimeout(intentarActualizar, 50);
    }
  });

  document.addEventListener('click', function(e) {
    if (e.target.closest && e.target.closest('#zk-banner')) return;
    // Detectar clicks en botones +/- de cantidad
    var isQtyBtn = e.target.closest && e.target.closest('.js-quantity, .quantity, [class*="quantity"]');
    if (isQtyBtn) {
      precioActual = 0;
      setTimeout(intentarActualizar, 100);
      setTimeout(intentarActualizar, 300);
    } else {
      setTimeout(intentarActualizar, 100);
      setTimeout(intentarActualizar, 350);
    }
  });

  function observarPrecio() {
    var c = document.querySelector('.product, .product-info, #product-info, [class*="product__info"], main, #MainContent');
    if (!c) return;
    new MutationObserver(intentarActualizar).observe(c, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'data-price', 'value'],
    });
  }

  // ── Aplicar config dinámica ─────────────────────────────────────────────────
  function aplicarWidgetTitle(title) {
    document.getElementById('zk-title').textContent = title || TITLE_DEFAULT;
  }

  function aplicarWidgetChips(chipsJson, visible) {
    var c = document.getElementById('zk-chips');
    if (!c) return;
    if (visible === false) { c.style.display = 'none'; return; }
    c.style.display = '';
    var chips = CHIP_DEFAULTS;
    if (chipsJson) {
      try { var parsed = JSON.parse(chipsJson); if (Array.isArray(parsed) && parsed.length > 0) chips = parsed; } catch(e) {}
    }
    c.innerHTML = '';
    for (var i = 0; i < 4; i++) {
      var text = (chips[i] && chips[i].trim()) ? chips[i].trim() : CHIP_DEFAULTS[i];
      var span = document.createElement('span');
      span.className = 'zk-chip';
      span.textContent = text;
      c.appendChild(span);
    }
  }

  function aplicarWidgetBtnText(text) {
    document.getElementById('zk-cta').textContent = (text && text.trim()) ? text.trim() : BTN_DEFAULT;
  }

  function aplicarBeneficio(benefitType, benefitValue) {
    BENEFIT_TYPE  = benefitType  || 'discount';
    BENEFIT_VALUE = benefitValue || '10';
    DESCUENTO     = BENEFIT_TYPE === 'discount' ? (parseFloat(BENEFIT_VALUE) || 10) / 100 : 0;
    var badgeEl = document.getElementById('zk-badge');
    if (BENEFIT_TYPE === 'discount') {
      document.getElementById('zk-price-section').style.display = '';
      document.getElementById('zk-benefit-text').style.display  = 'none';
      if (badgeEl) badgeEl.textContent = Math.round(DESCUENTO * 100) + '% OFF';
    } else {
      document.getElementById('zk-price-section').style.display = 'none';
      document.getElementById('zk-benefit-text').style.display  = '';
      var labels = { gift: '\u{1F381} Con cada entrega recibís: ' + (BENEFIT_VALUE || ''), free_shipping: '\u{1F69A} Cada entrega incluye envío gratis' };
      document.getElementById('zk-benefit-text').textContent = labels[BENEFIT_TYPE] || BENEFIT_VALUE;
      var badgeLabels = { gift: 'REGALO', free_shipping: 'ENVÍO GRATIS' };
      if (badgeEl) badgeEl.textContent = badgeLabels[BENEFIT_TYPE] || BENEFIT_TYPE.toUpperCase();
    }
  }

  function aplicarWidgetColors(accent, bg, text) {
    _accent = accent || _accent;
    _bg     = bg     || _bg;
    _text   = text   || _text;
    styleEl.textContent = buildCss(_accent, _bg, _text);
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  function init() {
    banner.style.display = '';
    insertarBanner(); // asegurar que esté en el DOM (otra app pudo removerlo)
    var p = leerPrecio();
    if (p > 0) actualizarBanner(p);
    observarPrecio();
    vigilarBanner();
  }

  function hideBanner() { banner.style.display = 'none'; }

  // ── Vigilar que el banner no sea removido por otras apps (bundles, etc.) ────
  var _vigilandoActivo = false;
  function vigilarBanner() {
    if (_vigilandoActivo) return;
    _vigilandoActivo = true;

    // Heartbeat: cada 1.5s verificar que el banner siga en el DOM
    // Más confiable que MutationObserver (no tiene timing issues con otras apps)
    var _checks = 0;
    setInterval(function() {
      _checks++;
      if (_checks > 200) return; // parar después de 5 minutos
      if (banner.style.display === 'none') return; // widget no activo aún
      if (!document.body.contains(banner)) {
        _bannerRemovido++;
        insertarBanner();
      }
    }, 1500);
  }

  // ── Detectar plataforma y producto ──────────────────────────────────────────

  function getScriptParam(name) {
    try {
      var scripts = document.querySelectorAll('script[src*="widget.js"]');
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || '';
        var match = src.match(new RegExp('[?&]' + name + '=([^&]*)'));
        if (match) return decodeURIComponent(match[1]);
      }
    } catch(e) {}
    return null;
  }

  function getProductId() {
    try {
      // Shopify
      if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product)
        return String(window.ShopifyAnalytics.meta.product.id);
      if (window.meta && window.meta.product && window.meta.product.id)
        return String(window.meta.product.id);
      // Tiendanube — LS.store expone product ID en la página de producto
      if (window.LS && window.LS.product && window.LS.product.id)
        return String(window.LS.product.id);
    } catch(e) {}
    return null;
  }

  var platform   = getScriptParam('platform') || 'shopify';
  // storeId: nuestro param manual O el "store" que Tiendanube inyecta automáticamente
  var storeId    = getScriptParam('storeId') || getScriptParam('store') || null;
  var shopDomain = window.location.hostname;
  var productId  = getProductId();

  // Auto-detectar plataforma Tiendanube por dominio o LS global
  if (platform === 'shopify' && (shopDomain.match(/mitiendanube\.com|nuvemshop\.com/) || (window.LS && window.LS.store))) {
    platform = 'tiendanube';
    if (!storeId && window.LS && window.LS.store && window.LS.store.id) storeId = String(window.LS.store.id);
  }

  // Si no hay productId en página que no es de producto, salir silenciosamente
  if (!productId) { hideBanner(); return; }

  // Construir URL de check según plataforma
  var checkUrl = APP + '/api/products/check?productId=' + encodeURIComponent(productId);
  if (platform === 'tiendanube' && storeId) {
    checkUrl += '&storeId=' + encodeURIComponent(storeId);
  } else {
    checkUrl += '&shop=' + encodeURIComponent(shopDomain);
  }

  fetch(checkUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.enabled) { hideBanner(); return; }
      aplicarBeneficio(data.benefitType, data.benefitValue);
      aplicarWidgetTitle(data.widgetTitle);
      aplicarWidgetChips(data.widgetChips, data.widgetChipsVisible);
      aplicarWidgetBtnText(data.widgetBtnText);
      if (data.widgetAccentColor || data.widgetBgColor || data.widgetTextColor)
        aplicarWidgetColors(data.widgetAccentColor, data.widgetBgColor, data.widgetTextColor);
      if (data.beneficios) window._planBeneficios = data.beneficios;
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
      else init();
    })
    .catch(hideBanner);
})();
