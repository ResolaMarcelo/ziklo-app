const express = require('express');
const router = express.Router();
const path = require('path');

// Página de éxito después de suscribirse
router.get('/gracias', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/cliente/gracias.html'));
});

// Portal del cliente
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/cliente/index.html'));
});

module.exports = router;
