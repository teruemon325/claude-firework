/* 花火の簡易表示（デモ版）
 * 実際の開花直径・明るさ・残光を再現するものではありません。 */

let entities = [];

export function renderFirework(viewer, site, groundHeight, altitudeAGL) {
  clearFirework(viewer);
  const base = groundHeight ?? 0;
  const top = base + altitudeAGL;

  // 高度を示す縦線
  entities.push(viewer.entities.add({
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights([
        site.lon, site.lat, base, site.lon, site.lat, top,
      ]),
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.ORANGE.withAlpha(0.8),
      }),
    },
  }));

  // 花火の球（開花のイメージ。実寸ではありません）
  entities.push(viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, top),
    ellipsoid: {
      radii: new Cesium.Cartesian3(60, 60, 60),
      material: Cesium.Color.fromCssColorString('#ffd166').withAlpha(0.45),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#ff8800').withAlpha(0.9),
    },
    label: {
      text: `花火（イメージ）\n地上高 ${altitudeAGL} m`,
      font: '13px sans-serif',
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.BLACK.withAlpha(0.6),
      pixelOffset: new Cesium.Cartesian2(0, -46),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }));

  // 打上地点のマーカー
  entities.push(viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, base),
    point: { pixelSize: 10, color: Cesium.Color.ORANGERED,
      outlineColor: Cesium.Color.WHITE, outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: {
      text: '打上地点（推定）',
      font: '12px sans-serif', fillColor: Cesium.Color.WHITE,
      showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('#7f1d1d').withAlpha(0.85),
      pixelOffset: new Cesium.Cartesian2(0, 18),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }));
  return top;
}

export function clearFirework(viewer) {
  entities.forEach((e) => viewer.entities.remove(e));
  entities = [];
}
