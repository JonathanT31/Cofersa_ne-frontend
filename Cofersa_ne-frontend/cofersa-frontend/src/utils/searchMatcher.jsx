import React from 'react';

/**
 * Calculates Dice's Coefficient similarity between two strings (0.0 to 1.0)
 */
export function diceCoefficient(str1, str2) {
  const s1 = (str1 || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = (str2 || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  if (s1.length < 2 || s2.length < 2) {
    // Fallback for single-character matches
    return s1.includes(s2) || s2.includes(s1) ? 0.5 : 0.0;
  }
  
  const getBigrams = (str) => {
    const bigrams = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };
  
  const bigrams1 = getBigrams(s1);
  const bigrams2 = getBigrams(s2);
  
  let intersection = 0;
  for (const val of bigrams1) {
    if (bigrams2.has(val)) {
      intersection++;
    }
  }
  
  return (2.0 * intersection) / (bigrams1.size + bigrams2.size);
}

/**
 * Scores how well a token matches a single target text
 */
export function scoreTokenMatch(targetText, token) {
  const text = (targetText || '').toLowerCase();
  const tok = (token || '').toLowerCase();
  
  if (!text || !tok) return 0;
  
  // 1. Exact match
  if (text === tok) return 1.0;
  
  // 2. Prefix match (starts with)
  if (text.startsWith(tok)) return 0.8 + (tok.length / text.length) * 0.15;
  
  // 3. Substring match
  if (text.includes(tok)) return 0.6 + (tok.length / text.length) * 0.15;
  
  // 4. Fuzzy match on individual words
  const words = text.split(/[\s_\-\/]+/);
  let maxFuzzy = 0;
  for (const word of words) {
    if (word.length >= 2 && tok.length >= 2) {
      const sim = diceCoefficient(word, tok);
      if (sim > maxFuzzy) maxFuzzy = sim;
    }
  }
  
  // Return the fuzzy score if it's above the threshold
  if (maxFuzzy > 0.65) {
    return maxFuzzy * 0.5; // Scale down fuzzy matches slightly
  }
  
  return 0;
}

/**
 * Searches a product list for a query.
 * Matches must contain all tokens (either exactly, as prefix/substring, or fuzzily).
 * Results are sorted by score descending.
 */
export function fuzzySearch(products, query) {
  if (!query || !query.trim()) return [];
  
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  
  const results = [];
  
  for (const p of products) {
    const sku = (p.ARTICULO1 || '').toLowerCase();
    const desc = (p.DESCRIPCION || '').toLowerCase();
    const brand = (p.MARCA || '').toLowerCase();
    
    let totalScore = 0;
    let matchesAllTokens = true;
    
    for (const token of tokens) {
      // Check each field
      const skuScore = scoreTokenMatch(sku, token) * 1.5; // SKU matches are heavily weighted
      const descScore = scoreTokenMatch(desc, token) * 1.0;
      const brandScore = scoreTokenMatch(brand, token) * 0.8;
      
      const maxScore = Math.max(skuScore, descScore, brandScore);
      
      if (maxScore === 0) {
        matchesAllTokens = false;
        break;
      }
      
      totalScore += maxScore;
    }
    
    if (matchesAllTokens) {
      results.push({
        product: p,
        score: totalScore / tokens.length
      });
    }
  }
  
  // Sort by match quality (score) descending
  return results
    .sort((a, b) => b.score - a.score)
    .map(r => r.product);
}

/**
 * Highlight matching query tokens in the rendered text
 */
export function highlightText(text, query) {
  if (!text) return '';
  if (!query || !query.trim()) return text;
  
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return text;
  
  // Escape regex special chars to prevent syntax errors
  const escapedTokens = tokens
    .map(t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
    .filter(t => t.length > 0);
    
  if (escapedTokens.length === 0) return text;
  
  const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, index) => 
    regex.test(part) ? (
      <mark 
        key={index} 
        style={{ 
          backgroundColor: 'rgba(254, 240, 138, 0.6)', 
          color: '#856404', 
          padding: '0px 2px', 
          borderRadius: '2px', 
          fontWeight: 'bold',
          borderBottom: '1px solid rgba(234, 179, 8, 0.4)'
        }}
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/**
 * Local realistic mock database covering Cofersa's active brands.
 * Used as a fallback if the n8n webhook isn't configured, or to enhance autocomplete.
 */
export const MOCK_PRODUCTS = [
  // 3M
  { ARTICULO1: '3M-165-NE', DESCRIPCION: '3M CINTA ELECTRICA TEMFLEX 165 NEGRA 3/4x60FT', MARCA: '3M', BDF: 'N', PRECIO: 1250 },
  { ARTICULO1: '3M-33-PLUS', DESCRIPCION: '3M CINTA ELECTRICA PROFESIONAL VINILO SUPER 33+ 3/4', MARCA: '3M', BDF: 'N', PRECIO: 3800 },
  { ARTICULO1: '3M-RESO-OR', DESCRIPCION: '3M RESPIRADOR PARA PARTICULAS N95 CON VALVULA', MARCA: '3M', BDF: 'N', PRECIO: 2500 },
  { ARTICULO1: '3M-LENT-CL', DESCRIPCION: '3M LENTES DE SEGURIDAD VIRTUA AP LUNAS CLARAS', MARCA: '3M', BDF: 'N', PRECIO: 1950 },
  
  // BOSCH
  { ARTICULO1: 'BOS-GSB-13RE', DESCRIPCION: 'BOSCH TALADRO PERCUTOR GSB 13 RE 650W 1/2IN', MARCA: 'BOSCH', BDF: 'N', PRECIO: 48500 },
  { ARTICULO1: 'BOS-GWS-7115', DESCRIPCION: 'BOSCH ESMERILADORA ANGULAR GWS 7-115 720W 4.5IN', MARCA: 'BOSCH', BDF: 'N', PRECIO: 42000 },
  { ARTICULO1: 'BOS-BROC-CON', DESCRIPCION: 'BOSCH JUEGO DE BROCAS PARA CONCRETO CYL-3 (5 PCS)', MARCA: 'BOSCH ACC', BDF: 'N', PRECIO: 6200 },
  { ARTICULO1: 'BOS-BUJ-F8D', DESCRIPCION: 'BOSCH BUJIA SUPER 4 F8DFP ALEMANA', MARCA: 'BOSCH AUTO', BDF: 'N', PRECIO: 2800 },

  // WD 40
  { ARTICULO1: 'WD40-3OZ', DESCRIPCION: 'WD-40 LUBRICANTE MULTIUSO SPRAY 3 OZ', MARCA: 'WD 40', BDF: 'N', PRECIO: 2100 },
  { ARTICULO1: 'WD40-11OZ', DESCRIPCION: 'WD-40 LUBRICANTE MULTIUSO SPRAY 11 OZ', MARCA: 'WD 40', BDF: 'N', PRECIO: 3950 },
  { ARTICULO1: 'WD40-FLEX-15', DESCRIPCION: 'WD-40 SPECIALIST LUBRICANTE CON CANULA FLEXIBLE 15 OZ', MARCA: 'WD 40', BDF: 'N', PRECIO: 6500 },

  // STANLEY (STAN1)
  { ARTICULO1: 'STA-90-947', DESCRIPCION: 'STANLEY JUEGO DE HERRAMIENTAS MECANICAS 99 PIEZAS', MARCA: 'STAN1', BDF: 'N', PRECIO: 72000 },
  { ARTICULO1: 'STA-12-220', DESCRIPCION: 'STANLEY CEPILLO DE BANCO PARA CARPINTERIA N.4', MARCA: 'STAN1', BDF: 'N', PRECIO: 24500 },
  { ARTICULO1: 'STA-FLEX-8M', DESCRIPCION: 'STANLEY FLEXOMETRO GLOBAL TAPE 8M / 26FT', MARCA: 'STAN1', BDF: 'N', PRECIO: 5800 },

  // AMANCO
  { ARTICULO1: 'AMA-TUB-PVC12', DESCRIPCION: 'AMANCO TUBO PVC PRESION AGUA CRISTALINA 1/2IN SDR13.5', MARCA: 'AMANCO', BDF: 'N', PRECIO: 1550 },
  { ARTICULO1: 'AMA-COD-PVC90', DESCRIPCION: 'AMANCO CODO PVC 90 GRADOS PRESION 1/2IN', MARCA: 'AMANCO', BDF: 'N', PRECIO: 250 },
  { ARTICULO1: 'AMA-CEM-PVC', DESCRIPCION: 'AMANCO CEMENTO SOLVENTE PVC TRANSPARENTE 125ML', MARCA: 'AMANCO CONDU', BDF: 'N', PRECIO: 1850 },

  // BTICINO
  { ARTICULO1: 'BTI-MOD-INT', DESCRIPCION: 'BTICINO INTERRUPTOR SIMPLE MODUS PRO 10A blanco', MARCA: 'BTICINO', BDF: 'N', PRECIO: 1100 },
  { ARTICULO1: 'BTI-MOD-TOM', DESCRIPCION: 'BTICINO TOMACORRIENTE DOBLE CON TIERRA MODUS PRO', MARCA: 'BTICINO', BDF: 'N', PRECIO: 1650 },
  { ARTICULO1: 'BTI-MOD-PLA', DESCRIPCION: 'BTICINO PLACA DE 3 MODULOS MODUS BLANCA', MARCA: 'BTICINO', BDF: 'N', PRECIO: 450 },

  // DURACELL
  { ARTICULO1: 'DUR-PILA-AA4', DESCRIPCION: 'DURACELL PILAS ALCALINAS AA BLISTER 4 UNID', MARCA: 'DURACELL', BDF: 'N', PRECIO: 3400 },
  { ARTICULO1: 'DUR-PILA-AAA4', DESCRIPCION: 'DURACELL PILAS ALCALINAS AAA BLISTER 4 UNID', MARCA: 'DURACELL', BDF: 'N', PRECIO: 3400 },
  { ARTICULO1: 'DUR-PILA-9V1', DESCRIPCION: 'DURACELL PILA ALCALINA 9V BLISTER 1 UNID', MARCA: 'DURACELL', BDF: 'N', PRECIO: 4100 },

  // URREA
  { ARTICULO1: 'URR-5412', DESCRIPCION: 'URREA DADO DE IMPACTO 1/2IN LARGO 12 PUNTAS 5/8IN', MARCA: 'URREA', BDF: 'N', PRECIO: 5600 },
  { ARTICULO1: 'URR-UP772', DESCRIPCION: 'URREA PISTOLA DE IMPACTO NEUMATICA 1/2IN PROFESIONAL', MARCA: 'URREA', BDF: 'N', PRECIO: 115000 },
  { ARTICULO1: 'URR-1218', DESCRIPCION: 'URREA LLAVE COMBINADA DE BOCA Y CORONA 9/16IN', MARCA: 'URREA', BDF: 'N', PRECIO: 4200 },

  // SUR
  { ARTICULO1: 'SUR-GOLT-BL', DESCRIPCION: 'SUR PINTURA GOLTEX ANTICORROSIVA MATE BLANCO 1 GALON', MARCA: 'SUR', BDF: 'N', PRECIO: 24500 },
  { ARTICULO1: 'SUR-FAST-GR', DESCRIPCION: 'SUR FAST ESMALTE SECADO RAPIDO GRIS 1 GALON', MARCA: 'SUR', BDF: 'N', PRECIO: 18900 },
  { ARTICULO1: 'SUR-KILZ-1G', DESCRIPCION: 'SUR SELLADOR DE PAREDES KILZ ACRILICO 1 GALON', MARCA: 'SUR Q', BDF: 'N', PRECIO: 15400 },

  // LOCTITE (LOCT)
  { ARTICULO1: 'LOC-242-10', DESCRIPCION: 'LOCTITE ADHESIVO TRABADOR ROSCAS AZUL 242 10ML', MARCA: 'LOCT', BDF: 'N', PRECIO: 7200 },
  { ARTICULO1: 'LOC-401-20', DESCRIPCION: 'LOCTITE PEGAMENTO INSTANTANEO MULTIUSO 401 20GR', MARCA: 'LOCT', BDF: 'N', PRECIO: 6900 },
  { ARTICULO1: 'LOC-567-50', DESCRIPCION: 'LOCTITE SELLADOR DE ROSCAS TUBERIAS 567 50ML', MARCA: 'LOCT', BDF: 'N', PRECIO: 14800 },

  // HENKEL
  { ARTICULO1: 'HEN-SUP-GLU', DESCRIPCION: 'HENKEL SUPER GLUE LIQUIDO PRECISION 3G', MARCA: 'HENKEL', BDF: 'N', PRECIO: 1200 },
  { ARTICULO1: 'HEN-PAT-CEM', DESCRIPCION: 'HENKEL PATTEX PEGAMENTO DE CONTACTO LIQUIDO 1L', MARCA: 'HENKEL', BDF: 'N', PRECIO: 8900 },

  // AMANCO CONDU / DEXSON / RIMAX / RAYOVAC
  { ARTICULO1: 'DEX-CAN-1M', DESCRIPCION: 'DEXSON CANALETA PVC ADHESIVA 20X12MM L-2M BLANCA', MARCA: 'DEXSON', BDF: 'N', PRECIO: 1400 },
  { ARTICULO1: 'RIM-SILL-PL', DESCRIPCION: 'RIMAX SILLA PLASTICA CONFORT CON BRAZOS CAFE', MARCA: 'RIMAX', BDF: 'N', PRECIO: 8500 },
  { ARTICULO1: 'RAY-PILA-D2', DESCRIPCION: 'RAYOVAC PILAS DE ZINC D BLISTER 2 UNID', MARCA: 'RAYOVAC', BDF: 'N', PRECIO: 1200 }
];
