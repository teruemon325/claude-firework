/* 交通規制の表示（デモ版）
 * 公式PDF等の図は転載せず、公表内容を基に再作図した GeoJSON を赤色で表示する。 */

const STYLE = {
  vehicle_closed:    { color: '#e11d48', width: 8,  label: '車両通行止め' },
  bridge_closed:     { color: '#be123c', width: 12, label: '橋の全面通行禁止' },
  river_road_closed: { color: '#9f1239', width: 6,  label: '河川管理用道路 通行止め' },
};

export async function loadRegulation(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`交通規制データを取得できませんでした (HTTP ${res.status})`);
  return res.json();
}

/** Cesium に赤色で描画して DataSource を返す */
export async function showRegulation(viewer, geojson) {
  const ds = await Cesium.GeoJsonDataSource.load(geojson, { clampToGround: true });
  ds.entities.values.forEach((ent) => {
    const kind = ent.properties?.kind?.getValue?.() ?? 'vehicle_closed';
    const st = STYLE[kind] ?? STYLE.vehicle_closed;
    if (ent.polyline) {
      ent.polyline.material = Cesium.Color.fromCssColorString(st.color).withAlpha(0.9);
      ent.polyline.width = st.width;
      ent.polyline.clampToGround = true;
    }
  });
  await viewer.dataSources.add(ds);
  return ds;
}

export function legendItems(geojson) {
  const seen = new Map();
  for (const f of geojson.features) {
    const p = f.properties;
    if (!seen.has(p.id)) {
      seen.set(p.id, {
        id: p.id, name: p.name, kind: p.kind,
        color: (STYLE[p.kind] ?? STYLE.vehicle_closed).color,
        kindLabel: (STYLE[p.kind] ?? STYLE.vehicle_closed).label,
        timeRange: p.timeRange, detail: p.detail, note: p.note,
        source: p.source, officialUrl: p.officialUrl,
      });
    }
  }
  return [...seen.values()];
}

/** 都南大橋の全面通行禁止時間を取り出す */
export function bridgeClosure(geojson) {
  const f = geojson.features.find((x) => x.properties.kind === 'bridge_closed');
  return f ? f.properties : null;
}
