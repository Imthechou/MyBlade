import {
  _decorator, Component, Node, MeshRenderer, Material, Color, Vec3,
  utils, input, Input, EventTouch, EventMouse, view, Camera,
  RigidBody, BoxCollider, ERigidBodyType, DirectionalLight
} from 'cc';

const { ccclass, property } = _decorator;
type Pt = { x: number; y: number; z: number };
type Geo = { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };

/**
 * Cocos Creator 3.8 vertical slice. All geometry is real 3D.
 * No Canvas2D target fake; rigid bodies drive split wooden pieces.
 * Break uses a pre-cut plane (NOT arbitrary dynamic mesh slicing).
 *
 * Editor / MCP: edit bladeTint, patternContrast and lightLux on this component.
 * Web automated tests: globalThis.__MYBLADE, available after start().
 */
@ccclass('LabBootstrap')
export class LabBootstrap extends Component {
  @property({ type: Color, tooltip: '刀身 PBR 主色；可由编辑器/MCP 修改' })
  bladeTint = new Color(166, 194, 210, 255);
  @property({ tooltip: '花纹层强度 0~1' })
  patternContrast = 0.70;
  @property({ tooltip: '主灯照度' })
  lightLux = 30000;

  private bladeRoot: Node | null = null;
  private intact: Node | null = null;
  private fragments: Node[] = [];
  private camera: Camera | null = null;
  private light: DirectionalLight | null = null;
  private metals: Material[] = [];
  private patternMats: Material[] = [];
  private swipeStart: { x: number; y: number } | null = null;
  private swing = -1;
  private queuedHit = false;
  private splitTime = -1;
  private cuts = 0;
  private woodMat!: Material;
  private freshWood!: Material;

  start(): void {
    const scene = this.node.scene;
    if (!scene) throw new Error('LabBootstrap must be attached to an active scene');
    const camNode = scene.getChildByName('Main Camera');
    this.camera = camNode?.getComponent(Camera) || null;
    if (camNode) {
      camNode.setPosition(0, 2.7, 10.8);
      camNode.lookAt(new Vec3(0, -0.25, 0));
    }
    this.light = scene.getChildByName('Main Light')?.getComponent(DirectionalLight) || null;
    if (this.light) this.light.illuminance = this.lightLux;

    this.woodMat = this.makeMaterial(new Color(145, 97, 57), 0, .82);
    this.freshWood = this.makeMaterial(new Color(207, 158, 100), 0, .92);
    this.makeEnvironment();
    this.makeSword();
    this.makeBlock();

    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseStart, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseEnd, this);
    const host = globalThis as any;
    host.__MYBLADE = {
      ready: true,
      state: { cutCount: 0, split: false, bladeReady: true, lastHit: 'none' },
      setLook: (p: { color?: number[]; pattern?: number; light?: number }) => this.setLook(p),
      slash: () => this.slash(true),
      reset: () => this.reset(),
    };
    console.info('[MyBlade] Cocos 3D lab ready');
  }

  onDestroy(): void {
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseStart, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseEnd, this);
    delete (globalThis as any).__MYBLADE;
  }

  private makeMaterial(color: Color, metal: number, rough: number): Material {
    const m = new Material();
    m.initialize({ effectName: 'builtin-standard', technique: 0 });
    m.setProperty('mainColor', color);
    m.setProperty('metallic', metal);
    m.setProperty('roughness', rough);
    return m;
  }

  private addBox(parent: Node, name: string, dimensions: Vec3, loc: Vec3, mat: Material): Node {
    const n = new Node(name);
    n.parent = parent;
    n.setPosition(loc);
    const r = n.addComponent(MeshRenderer);
    const box = requireBox(dimensions);
    r.mesh = utils.MeshUtils.createMesh(box);
    r.setMaterial(mat, 0);
    return n;
  }

  private makeEnvironment(): void {
    const floorMat = this.makeMaterial(new Color(51, 63, 77), .13, .78);
    const stageMat = this.makeMaterial(new Color(104, 119, 127), .58, .37);
    const floor = this.addBox(this.node, 'Floor', new Vec3(20, .2, 13),
      new Vec3(0, -2.1, -.8), floorMat);
    this.addStaticCollider(floor, new Vec3(20, .2, 13));
    this.addBox(this.node, 'Cutting Bench', new Vec3(2.9, .3, 1.3),
      new Vec3(0, -1.55, -.2), stageMat);
    this.addBox(this.node, 'Back Plate', new Vec3(7, 5, .10),
      new Vec3(0, .20, -2.5), this.makeMaterial(new Color(40, 52, 64), .23, .84));
  }

  private makeSword(): void {
    const root = new Node('Real 3D Sword');
    root.parent = this.node;
    root.setPosition(-2.45, -1.6, 1.85);
    root.setRotationFromEuler(0, -6, -20);
    this.bladeRoot = root;

    const blade = new Node('Tapered Blade');
    blade.parent = root;
    const renderer = blade.addComponent(MeshRenderer);
    renderer.mesh = utils.MeshUtils.createMesh(this.bladeMesh());
    const steel = this.makeMaterial(this.bladeTint, .96, .26);
    this.metals.push(steel);
    renderer.setMaterial(steel, 0);

    const gold = this.makeMaterial(new Color(195, 164, 112), .9, .31);
    const grip = this.makeMaterial(new Color(40, 47, 56), .13, .71);
    this.addBox(root, 'Guard', new Vec3(1.05, .17, .22), new Vec3(.02, .47, 0), gold);
    this.addBox(root, 'Grip', new Vec3(.26, 1.17, .27), new Vec3(.02, -.21, 0), grip);
    this.addBox(root, 'Pommel', new Vec3(.37, .20, .34), new Vec3(.02, -.82, 0), gold);

    // Lightweight geometry-based Damascus-like ribbons, rendered ON the blade.
    // Not a texture/shader port; this is a pattern test, not production-quality steel.
    const pattern = new Node('Procedural Wave Pattern');
    pattern.parent = root;
    const pr = pattern.addComponent(MeshRenderer);
    pr.mesh = utils.MeshUtils.createMesh(this.patternMesh());
    const pm = this.makeMaterial(new Color(101, 132, 151), .92, .30);
    this.patternMats.push(pm);
    pr.setMaterial(pm, 0);
  }

  private bladeMesh(): Geo {
    // Face and thickness extrusion, broad near guard, point at the far tip.
    const outline: Pt[] = [
      {x:-.22,y:.58,z:0}, {x:.30,y:.58,z:0},
      {x:.32,y:2.20,z:0}, {x:.23,y:3.18,z:0},
      {x:.04,y:3.74,z:0}, {x:-.19,y:3.37,z:0},
      {x:-.22,y:2.20,z:0},
    ];
    const g = emptyGeo();
    for (let i=1;i<outline.length-1;i++) {
      face(g, { ...outline[0], z:.065 }, { ...outline[i], z:.065 }, { ...outline[i+1], z:.065 });
      face(g, { ...outline[0], z:-.065 }, { ...outline[i+1], z:-.065 }, { ...outline[i], z:-.065 });
    }
    for (let i=0;i<outline.length;i++) {
      const a=outline[i],b=outline[(i+1)%outline.length];
      face(g,{...a,z:.065},{...a,z:-.065},{...b,z:-.065});
      face(g,{...a,z:.065},{...b,z:-.065},{...b,z:.065});
    }
    return g;
  }

  private patternMesh(): Geo {
    const g=emptyGeo();
    for(let lane=0;lane<7;lane++) {
      const y0=.78+lane*.36;
      for(let s=0;s<10;s++) {
        const y=y0+s*.04, ny=y+.04;
        const x=-.13+.11*Math.sin(y*7+lane*.69);
        const nx=-.13+.11*Math.sin(ny*7+lane*.69);
        const w=.009;
        face(g,{x:x-w,y,z:.071},{x:x+w,y,z:.071},{x:nx+w,y:ny,z:.071});
        face(g,{x:x-w,y,z:.071},{x:nx+w,y:ny,z:.071},{x:nx-w,y:ny,z:.071});
      }
    }
    return g;
  }

  private makeBlock(): void {
    this.intact = this.addBox(this.node, 'Solid Wood Target',
      new Vec3(1.5, 1.65, .68), new Vec3(0, -.52, .02), this.woodMat);
    this.addStaticCollider(this.intact, new Vec3(1.5, 1.65, .68));
    this.addBox(this.node, 'Cut Guide', new Vec3(.022, 1.63, .7),
      new Vec3(0, -.52, .02), this.makeMaterial(new Color(210, 170, 115), .1, .7));
  }

  private addStaticCollider(n: Node, size: Vec3): void {
    const rb = n.addComponent(RigidBody);
    rb.type = ERigidBodyType.STATIC;
    const box = n.addComponent(BoxCollider);
    box.size = size;
  }

  private touchStart(e: EventTouch): void { const p=e.getLocation(); this.swipeStart={x:p.x,y:p.y}; }
  private touchEnd(e: EventTouch): void { const p=e.getLocation(); this.finishSwipe(p.x,p.y); }
  private mouseStart(e: EventMouse): void { this.swipeStart={x:e.getLocationX(),y:e.getLocationY()}; }
  private mouseEnd(e: EventMouse): void { this.finishSwipe(e.getLocationX(),e.getLocationY()); }
  private finishSwipe(x:number,y:number):void {
    const p=this.swipeStart;this.swipeStart=null;
    if(!p)return;
    const length=Math.hypot(x-p.x,y-p.y);
    const v=view.getVisibleSize(), mx=(p.x+x)/2, my=(p.y+y)/2;
    const overBlock=Math.abs(mx-v.width*.5)<v.width*.29 && Math.abs(my-v.height*.48)<v.height*.34;
    if(length>65 && overBlock) this.slash(true);
  }

  private slash(hit:boolean): void {
    if(this.swing>=0)return;
    this.swing=0;
    this.queuedHit=hit && !!this.intact && this.intact.active;
    (globalThis as any).__MYBLADE.state.lastHit = hit ? 'swing' : 'miss';
  }

  private cut():void {
    if(!this.intact||!this.intact.active)return;
    this.intact.active=false;
    this.node.getChildByName('Cut Guide')?.destroy();
    for(let side of [-1,1]){
      const piece = this.addBox(this.node,'Wood Piece '+side,
        new Vec3(.74,1.65,.68), new Vec3(side*.385,-.52,.02),this.woodMat);
      this.addBox(piece,'Fresh Cut Face',new Vec3(.018,1.64,.68),
        new Vec3(-side*.38,0,0),this.freshWood);
      const rb=piece.addComponent(RigidBody);
      rb.type=ERigidBodyType.DYNAMIC;
      rb.mass=1.8;
      const collider=piece.addComponent(BoxCollider);
      collider.size=new Vec3(.74,1.65,.68);
      rb.applyImpulse(new Vec3(side*2.5, 1.7, .6));
      this.fragments.push(piece);
    }
    this.cuts++;
    const bridge=(globalThis as any).__MYBLADE;
    bridge.state.cutCount=this.cuts; bridge.state.split=true; bridge.state.lastHit='cut';
    this.splitTime=0;
    console.info('[MyBlade] target split count='+this.cuts);
  }

  private reset():void {
    for(const fragment of this.fragments) fragment.destroy();
    this.fragments=[];
    if(this.intact)this.intact.destroy();
    this.makeBlock();
    this.splitTime=-1;
    const bridge=(globalThis as any).__MYBLADE;
    bridge.state.split=false;
  }

  private setLook(p: {color?:number[];pattern?:number;light?:number}):void {
    if(p.color?.length===3)this.bladeTint=new Color(p.color[0],p.color[1],p.color[2]);
    if(typeof p.pattern==='number')this.patternContrast=Math.max(0,Math.min(1,p.pattern));
    if(typeof p.light==='number')this.lightLux=Math.max(100,Math.min(100000,p.light));
    for(const m of this.metals)m.setProperty('mainColor',this.bladeTint);
    for(const m of this.patternMats)m.setProperty('mainColor',
      new Color(60+110*this.patternContrast,82+110*this.patternContrast,99+110*this.patternContrast));
    if(this.light)this.light.illuminance=this.lightLux;
  }

  update(dt:number):void {
    if(this.swing>=0 && this.bladeRoot) {
      this.swing=Math.min(1,this.swing+Math.min(dt,.05)/.30);
      const t=this.swing;
      // Sword is a true 3D MeshRenderer object moving through the target volume.
      this.bladeRoot.setPosition(-2.45+2.55*t,-1.6+.45*Math.sin(t*Math.PI),1.85-.35*t);
      this.bladeRoot.setRotationFromEuler(0,-6-24*t,-20+98*t);
      if(this.queuedHit&&t>=.52){this.queuedHit=false;this.cut();}
      if(t>=1)this.swing=-1;
    }
    if(this.splitTime>=0) {
      this.splitTime+=dt;
      if(this.splitTime>3.5)this.reset();
    }
  }
}

function emptyGeo(): Geo {return {positions:[],normals:[],uvs:[],indices:[]};}
function face(g:Geo,a:Pt,b:Pt,c:Pt):void {
  const u=new Vec3(b.x-a.x,b.y-a.y,b.z-a.z),v=new Vec3(c.x-a.x,c.y-a.y,c.z-a.z);
  const n=new Vec3();Vec3.cross(n,u,v);Vec3.normalize(n,n);
  const start=g.positions.length/3;
  for(const p of [a,b,c]){
    g.positions.push(p.x,p.y,p.z);
    g.normals.push(n.x,n.y,n.z);
    g.uvs.push(p.x,p.y/4);
  }
  g.indices.push(start,start+1,start+2);
}
function requireBox(size:Vec3):Geo {
  // Explicit mesh generated at runtime; no GLB/third-party asset dependency.
  const g=emptyGeo();
  const x=size.x*.5,y=size.y*.5,z=size.z*.5;
  const pts=[
    [[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]],
    [[x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]],
    [[-x,-y,-z],[-x,-y,z],[-x,y,z],[-x,y,-z]],
    [[x,-y,z],[x,-y,-z],[x,y,-z],[x,y,z]],
    [[-x,y,z],[x,y,z],[x,y,-z],[-x,y,-z]],
    [[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z]],
  ];
  for(const q of pts){
    const arr=q.map(p=>({x:p[0],y:p[1],z:p[2]}));
    face(g,arr[0],arr[1],arr[2]);face(g,arr[0],arr[2],arr[3]);
  }
  return g;
}
