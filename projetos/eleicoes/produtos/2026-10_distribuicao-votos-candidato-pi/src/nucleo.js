/**
 * nucleo.js — cálculos leves feitos no navegador (L0002).
 * Cada função espelha uma função de referência em
 * projetos/eleicoes/analise/preparar_distribuicao_pi.py e é conferida pelo
 * teste de paridade (src/paridade.html, tests/test_eleicoes_distribuicao_pi_paridade.py).
 * Nada aqui imputa ou corrige dados: lacunas chegam marcadas da base Python.
 */

/** Decodifica a base publicada (JSON compactado em gzip, em base64). */
export async function decodificarBase(b64) {
  const binario = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const fluxo = new Blob([binario]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(fluxo).text());
}

/** Vetor de votos por seção de uma candidatura (decodifica os deltas de seção). */
export function votosPorSecao(cargo, ci, nSecoes) {
  const vs = new Float64Array(nSecoes);
  const { inicio, delta_secao, votos } = cargo.votos;
  let s = 0;
  for (let k = inicio[ci]; k < inicio[ci + 1]; k++) {
    s += delta_secao[k];
    vs[s] = votos[k];
  }
  return vs;
}

/** Soma votos e válidos por grupo (Python: agregar). grupo -1 = fora do recorte. */
export function agregar(votosSecao, validosSecao, grupoSecao, nGrupos) {
  const votos = new Float64Array(nGrupos);
  const validos = new Float64Array(nGrupos);
  for (let i = 0; i < grupoSecao.length; i++) {
    const g = grupoSecao[i];
    if (g >= 0) {
      votos[g] += votosSecao[i];
      validos[g] += validosSecao[i];
    }
  }
  return { votos, validos };
}

/** Percentual dos votos válidos (Python: percentual); null sem válidos. */
export function percentual(votos, validos) {
  return validos > 0 ? (100 * votos) / validos : null;
}

/** Pearson entre pares definidos, peso igual por unidade (Python: pearson). */
export function pearson(x, y, minimo = 3) {
  const a = [], b = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== null && y[i] !== null && x[i] !== undefined && y[i] !== undefined) {
      a.push(x[i]); b.push(y[i]);
    }
  }
  const n = a.length;
  if (n < minimo) return { r: null, n };
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += a[i]; my += b[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = a[i] - mx, dy = b[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { r: null, n };
  return { r: sxy / Math.sqrt(sxx * syy), n };
}
