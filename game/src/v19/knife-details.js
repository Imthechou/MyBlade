const T = globalThis.THREE;

const fuller = 1, ridge = 2, hamon = 3, spine = 4;

// Grind type, cross-section center and width. The anchors are fractions of
// the whole knife's length and the local handle width, followed by pin radius.
export const knifeDetails = {
  balisong: { grind: [spine, .74, .11], anchors: [[.08, .20, .010], [.08, .80, .010], [.39, .25, .016], [.39, .73, .016]] },
  bayonet: { grind: [fuller, .67, .075], anchors: [[.048, .48, .012], [.33, .52, .011]] },
  folding: { grind: [spine, .72, .094], anchors: [[.102, .62, .013], [.42, .52, .022]] },
  gladius: { grind: [ridge, .51, .066], anchors: [[.12, .64, .014], [.325, .69, .014], [.400, .40, .012]] },
  karambit: { grind: [spine, .76, .11], anchors: [[.277, .44, .012], [.384, .39, .013]] },
  kris: { grind: [ridge, .50, .083], anchors: [[.064, .50, .010], [.24, .48, .011]] },
  machete: { grind: [fuller, .76, .061], anchors: [[.069, .51, .015], [.187, .49, .014], [.303, .63, .013]] },
  saber: { grind: [hamon, .24, .085], anchors: [[.066, .46, .010], [.30, .48, .011]] },
  skull: { grind: [ridge, .52, .048], anchors: [[.12, .51, .012], [.25, .48, .011]] },
  straight: { grind: [fuller, .68, .066], anchors: [[.077, .56, .013], [.223, .51, .013], [.356, .54, .013]] },
  survival: { grind: [spine, .72, .135], anchors: [[.094, .62, .013], [.293, .74, .013]] },
  tangdao: { grind: [hamon, .27, .061], anchors: [[.076, .51, .010], [.27, .48, .010]] },
};

// The shoulders, inset and pin head catch light at different angles. Place
// both faces on the actual mesh, including asymmetric and open handles.
export function makeFittingHardware(mesh, coordinates, anchors) {
  const raycaster = new T.Raycaster();
  const probe = new T.Mesh(mesh.geometry, mesh.material);
  const position = [], normal = [], color = [];
  const path = [[0, -.22], [.83, -.22], [1, -.04], [1, .09], [.84, .22],
    [.68, .22], [.62, .10], [.43, .10], [.36, .19], [0, .19]];
  const profile = path.map(([x, y]) => new T.Vector2(x, y));
  const indexed = new T.LatheGeometry(profile, 12);
  const pin = indexed.toNonIndexed();
  indexed.dispose();
  const { position: points, normal: normals } = pin.attributes;
  const local = new T.Vector3(), face = new T.Vector3();
  const up = new T.Vector3(0, 1, 0);
  const orientation = new T.Quaternion();

  for (const [u, across, size] of anchors) {
    for (const side of [-1, 1]) {
      for (const offset of [0, -.12, .12]) {
        const point = coordinates.crossSection(u, across + offset);
        if (!point || coordinates.region(point.x, point.y).grip < .92) continue;
        raycaster.ray.origin.set(point.x, point.y, side);
        raycaster.ray.direction.set(0, 0, -side);
        const hit = raycaster.intersectObject(probe, false)[0];
        if (!hit?.face || Math.abs(hit.face.normal.z) < .54) continue;
        face.copy(hit.normal || hit.face.normal).normalize();
        if (face.z * side < 0) face.negate();
        orientation.setFromUnitVectors(up, face);
        for (let i = 0; i < points.count; i++) {
          local.fromBufferAttribute(points, i);
          const trim = local.y < .12 && Math.hypot(local.x, local.z) < .74 ? .30 : 1;
          local.multiplyScalar(size).applyQuaternion(orientation).add(hit.point).addScaledVector(face, size * .055);
          position.push(local.x, local.y, local.z);
          local.fromBufferAttribute(normals, i).applyQuaternion(orientation);
          normal.push(local.x, local.y, local.z);
          color.push(trim, trim, trim);
        }
        break;
      }
    }
  }
  pin.dispose();
  if (!position.length) return null;
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(color, 3));
  const material = new T.MeshStandardMaterial({ vertexColors: true, metalness: .78, roughness: .34, envMapIntensity: 1.08 });
  const hardware = new T.Mesh(geometry, material);
  hardware.name = 'fitting-hardware';
  return hardware;
}
