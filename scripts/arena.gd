extends Node3D
## MyBlade / Godot 4.5.2 - small playable 3D vertical slice.
## Programmatic mesh + PBR steel shader + swipe-controlled 3D sword + rigid-body wood split.
## The cut is pre-fractured at a fixed plane; it is NOT arbitrary mesh boolean cutting.

@export var blade_tint: Color = Color("#b9d5ec")
@export_range(0.0, 1.0, 0.01) var pattern_strength: float = 0.75
@export_range(0.2, 5.0, 0.1) var key_light_power: float = 2.4

const COLORWAYS := [
    Color("#b9d5ec"), Color("#b6a5eb"), Color("#7bdac9"), Color("#f0bea6")
]

var _sword: Node3D
var _steel: ShaderMaterial
var _key: DirectionalLight3D
var _target: Node3D
var _pieces: Array[RigidBody3D] = []
var _start_pointer := Vector2(-1000.0, -1000.0)
var _swinging := false
var _target_split := false
var _cuts := 0
var _color_index := 0
var _score_label: Label
var _hint_label: Label


func _ready() -> void:
    _make_world()
    _make_camera()
    _make_lights()
    _make_stage()
    _make_sword()
    _make_target()
    _make_ui()
    _update_hud()
    _sync_web()
    print("[MYBLADE] READY - Godot 3D sword lab")


func _make_world() -> void:
    var env := Environment.new()
    env.background_mode = Environment.BG_COLOR
    env.background_color = Color("#101c2c")
    env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    env.ambient_light_color = Color("#9bbfd6")
    env.ambient_light_energy = 0.65
    env.reflected_light_source = Environment.REFLECTION_SOURCE_BG
    var world := WorldEnvironment.new()
    world.environment = env
    add_child(world)


func _make_camera() -> void:
    var camera := Camera3D.new()
    camera.name = "Game Camera"
    camera.fov = 53.0
    camera.current = true
    add_child(camera)
    camera.position = Vector3(0.0, 2.1, 9.3)
    camera.look_at(Vector3(0.0, 0.1, 0.0), Vector3.UP)


func _make_lights() -> void:
    _key = DirectionalLight3D.new()
    _key.name = "Key Light"
    _key.light_color = Color("#fff4e1")
    _key.light_energy = key_light_power
    _key.shadow_enabled = true
    _key.rotation_degrees = Vector3(-45, -28, 0)
    add_child(_key)
    var fill := OmniLight3D.new()
    fill.name = "Cold Rim"
    fill.position = Vector3(-3.0, 3.0, 4.0)
    fill.light_color = Color("#7eb5f0")
    fill.light_energy = 0.75
    fill.omni_range = 12.0
    add_child(fill)


func _material(c: Color, metallic_value: float = 0.0, roughness_value: float = 0.8) -> StandardMaterial3D:
    var m := StandardMaterial3D.new()
    m.albedo_color = c
    m.metallic = metallic_value
    m.roughness = roughness_value
    return m


func _mesh_box(label: String, parent: Node3D, dimensions: Vector3, location: Vector3, mat: Material) -> MeshInstance3D:
    var result := MeshInstance3D.new()
    result.name = label
    var mesh := BoxMesh.new()
    mesh.size = dimensions
    result.mesh = mesh
    result.material_override = mat
    result.position = location
    parent.add_child(result)
    return result


func _make_stage() -> void:
    var stage := _material(Color("#566b79"), 0.62, 0.41)
    var dark := _material(Color("#263647"), 0.30, 0.67)
    var trim := _material(Color("#9ab6c6"), 0.78, 0.28)
    _mesh_box("Backdrop", self, Vector3(8.0, 5.7, 0.18), Vector3(0, 0.2, -2.65), dark)
    _mesh_box("Cutting Table", self, Vector3(4.45, 0.26, 2.3), Vector3(0, -1.72, 0), stage)
    _mesh_box("Table Trim", self, Vector3(4.5, 0.06, 2.34), Vector3(0, -1.57, 0), trim)
    _mesh_box("Pedestal", self, Vector3(2.8, 0.44, 1.3), Vector3(0.55, -1.39, -0.35), dark)
    var floor_body := StaticBody3D.new()
    floor_body.name = "Ground Physics"
    floor_body.position = Vector3(0, -1.93, 0)
    add_child(floor_body)
    var shape := CollisionShape3D.new()
    var box := BoxShape3D.new()
    box.size = Vector3(8.0, 0.4, 5.5)
    shape.shape = box
    floor_body.add_child(shape)
    _mesh_box("Floor", floor_body, box.size, Vector3.ZERO, dark)


func _make_sword() -> void:
    _sword = Node3D.new()
    _sword.name = "Forged 3D Sword"
    add_child(_sword)
    _sword.position = Vector3(-1.65, -0.8, 1.0)
    _sword.rotation_degrees = Vector3(0, -14, -17)

    _steel = ShaderMaterial.new()
    _steel.shader = preload("res://shaders/steel.gdshader")
    _apply_look()
    var blade := MeshInstance3D.new()
    blade.name = "Procedural Tapered Blade"
    blade.mesh = _make_blade_mesh()
    blade.material_override = _steel
    _sword.add_child(blade)

    var guard_mat := _material(Color("#cba16b"), 0.84, 0.29)
    var grip_mat := _material(Color("#253642"), 0.18, 0.73)
    var edge_mat := _material(Color("#e0eaf0"), 0.91, 0.17)
    _mesh_box("Gold Crossguard", _sword, Vector3(0.92, 0.15, 0.24), Vector3(0, 0.42, 0), guard_mat)
    _mesh_box("Dark Grip", _sword, Vector3(0.23, 1.07, 0.23), Vector3(0, -0.19, 0), grip_mat)
    _mesh_box("Pommel", _sword, Vector3(0.34, 0.18, 0.32), Vector3(0, -0.77, 0), guard_mat)
    _mesh_box("Edge Glint", _sword, Vector3(0.025, 2.05, 0.017), Vector3(0.265, 1.55, 0.073), edge_mat)


func _add_triangle(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
    for vertex in [a, b, c]:
        st.set_uv(Vector2((vertex.x + 0.35) / 0.7, vertex.y / 3.4))
        st.add_vertex(vertex)


func _make_blade_mesh() -> ArrayMesh:
    var points := PackedVector2Array([
        Vector2(-0.18, 0.53), Vector2(0.18, 0.53),
        Vector2(0.29, 1.85), Vector2(0.22, 2.62),
        Vector2(0.04, 3.28), Vector2(-0.16, 2.96),
        Vector2(-0.20, 1.67)
    ])
    var indices := Geometry2D.triangulate_polygon(points)
    var tool := SurfaceTool.new()
    tool.begin(Mesh.PRIMITIVE_TRIANGLES)
    for i in range(0, indices.size(), 3):
        var a := points[indices[i]]
        var b := points[indices[i + 1]]
        var c := points[indices[i + 2]]
        _add_triangle(tool, Vector3(a.x, a.y, 0.066), Vector3(b.x, b.y, 0.066), Vector3(c.x, c.y, 0.066))
        _add_triangle(tool, Vector3(c.x, c.y, -0.066), Vector3(b.x, b.y, -0.066), Vector3(a.x, a.y, -0.066))
    for i in points.size():
        var a := points[i]
        var b := points[(i + 1) % points.size()]
        _add_triangle(tool, Vector3(a.x,a.y,0.066), Vector3(a.x,a.y,-0.066), Vector3(b.x,b.y,-0.066))
        _add_triangle(tool, Vector3(a.x,a.y,0.066), Vector3(b.x,b.y,-0.066), Vector3(b.x,b.y,0.066))
    tool.generate_normals()
    return tool.commit()


func _make_target() -> void:
    _target_split = false
    _target = Node3D.new()
    _target.name = "Solid Wood Challenge"
    _target.position = Vector3(0.60, -0.53, 0.0)
    add_child(_target)
    var wood := _material(Color("#b9875b"), 0.0, 0.83)
    var grain := _material(Color("#875937"), 0.0, 0.88)
    _mesh_box("Wood Block", _target, Vector3(1.36, 1.62, 0.76), Vector3.ZERO, wood)
    for j in 5:
        var stripe := _mesh_box("Wood Grain", _target, Vector3(0.028, 1.47, 0.012), Vector3(-0.48 + j * 0.23, 0.0, 0.386), grain)
        stripe.rotation_degrees.z = (j % 3 - 1) * 2.5


func _split_target() -> void:
    if _target_split or not is_instance_valid(_target):
        return
    _target_split = true
    _target.hide()
    var wood := _material(Color("#b9875b"), 0, 0.85)
    var fresh := _material(Color("#deb78e"), 0, 0.91)
    for s in [-1, 1]:
        var body := RigidBody3D.new()
        body.name = "Split Wood Piece %s" % s
        body.position = _target.position + Vector3(s * 0.35, 0, 0)
        body.mass = 1.4
        add_child(body)
        _mesh_box("Outer Bark", body, Vector3(0.67, 1.62, 0.76), Vector3.ZERO, wood)
        _mesh_box("Fresh Cut Face", body, Vector3(0.018, 1.61, 0.76), Vector3(-s * 0.335, 0, 0), fresh)
        var collider := CollisionShape3D.new()
        var box := BoxShape3D.new()
        box.size = Vector3(0.67, 1.62, 0.76)
        collider.shape = box
        body.add_child(collider)
        body.apply_central_impulse(Vector3(s * 2.35, 1.35, 1.2))
        body.apply_torque_impulse(Vector3(0.2, 0.3 * s, -0.75 * s))
        _pieces.append(body)
    _cuts += 1
    _update_hud()
    _sync_web()
    print("[MYBLADE] SPLIT cut=%d" % _cuts)
    get_tree().create_timer(3.2).timeout.connect(_reset_target)


func _reset_target() -> void:
    if is_instance_valid(_target):
        _target.queue_free()
    for piece in _pieces:
        if is_instance_valid(piece):
            piece.queue_free()
    _pieces.clear()
    _make_target()
    _update_hud()
    _sync_web()


func _request_slash() -> void:
    if _swinging or _target_split:
        return
    _swinging = true
    var move := create_tween()
    move.set_parallel(true)
    move.tween_property(_sword, "position", Vector3(1.05, -0.35, 0.48), 0.26).set_trans(Tween.TRANS_CUBIC)
    move.tween_property(_sword, "rotation_degrees", Vector3(0, -10, -102), 0.26).set_trans(Tween.TRANS_CUBIC)
    get_tree().create_timer(0.15).timeout.connect(_split_target)
    move.chain().tween_interval(0.16)
    move.tween_property(_sword, "position", Vector3(-1.65, -0.8, 1.0), 0.35)
    move.parallel().tween_property(_sword, "rotation_degrees", Vector3(0, -14, -17), 0.35)
    move.chain().tween_callback(func() -> void: _swinging = false)


func _input(event: InputEvent) -> void:
    if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if event.pressed:
            _start_pointer = event.position
        else:
            _finish_swipe(event.position)
    elif event is InputEventScreenTouch:
        if event.pressed:
            _start_pointer = event.position
        else:
            _finish_swipe(event.position)
    elif event is InputEventKey and event.pressed and not event.echo:
        match event.keycode:
            KEY_C:
                _cycle_color()
            KEY_P:
                pattern_strength = fmod(pattern_strength + 0.22, 1.05)
                _apply_look()
                _sync_web()
            KEY_L:
                key_light_power = 1.25 if key_light_power > 2.0 else 3.0
                _apply_look()
                _sync_web()
            KEY_R:
                if not _target_split:
                    _reset_target()


func _finish_swipe(end_position: Vector2) -> void:
    var start := _start_pointer
    _start_pointer = Vector2(-1000, -1000)
    if start.x < 0:
        return
    var length := start.distance_to(end_position)
    var size := get_viewport().get_visible_rect().size
    var midpoint := (start + end_position) * 0.5
    if length >= 85.0 and midpoint.x > size.x * 0.18 and midpoint.x < size.x * 0.87 and midpoint.y > size.y * 0.19 and midpoint.y < size.y * 0.84:
        _request_slash()


func _apply_look() -> void:
    if is_instance_valid(_steel):
        _steel.set_shader_parameter("steel_tint", blade_tint)
        _steel.set_shader_parameter("pattern_strength", pattern_strength)
    if is_instance_valid(_key):
        _key.light_energy = key_light_power


func _cycle_color() -> void:
    _color_index = (_color_index + 1) % COLORWAYS.size()
    blade_tint = COLORWAYS[_color_index]
    _apply_look()
    _sync_web()


func _make_ui() -> void:
    var layer := CanvasLayer.new()
    add_child(layer)
    var root := Control.new()
    root.mouse_filter = Control.MOUSE_FILTER_IGNORE
    root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    layer.add_child(root)

    var top := VBoxContainer.new()
    top.anchor_right = 1.0
    top.offset_left = 27
    top.offset_right = -27
    top.offset_top = 34
    top.add_theme_constant_override("separation", 7)
    root.add_child(top)
    var eyebrow := Label.new()
    eyebrow.text = "MYBLADE  /  GODOT 3D LAB"
    eyebrow.add_theme_font_size_override("font_size", 17)
    eyebrow.add_theme_color_override("font_color", Color("#8ed5d5"))
    top.add_child(eyebrow)
    var title := Label.new()
    title.text = "FORGE  /  CUT"
    title.add_theme_font_size_override("font_size", 38)
    title.add_theme_color_override("font_color", Color("#f0f7ff"))
    top.add_child(title)
    var subtitle := Label.new()
    subtitle.text = "PBR STEEL  -  PHYSICS WOOD  -  SWIPE"
    subtitle.add_theme_font_size_override("font_size", 14)
    subtitle.add_theme_color_override("font_color", Color("#a7b7c6"))
    top.add_child(subtitle)

    var bottom := VBoxContainer.new()
    bottom.anchor_top = 1.0
    bottom.anchor_bottom = 1.0
    bottom.anchor_right = 1.0
    bottom.offset_top = -210
    bottom.offset_bottom = -25
    bottom.offset_left = 25
    bottom.offset_right = -25
    bottom.add_theme_constant_override("separation", 13)
    root.add_child(bottom)
    _hint_label = Label.new()
    _hint_label.text = "SLIDE ACROSS THE WOOD BLOCK TO CUT"
    _hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    _hint_label.add_theme_font_size_override("font_size", 16)
    _hint_label.add_theme_color_override("font_color", Color("#e8f3f8"))
    bottom.add_child(_hint_label)
    _score_label = Label.new()
    _score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    _score_label.add_theme_font_size_override("font_size", 20)
    _score_label.add_theme_color_override("font_color", Color("#8ee1d0"))
    bottom.add_child(_score_label)

    var buttons := HBoxContainer.new()
    buttons.add_theme_constant_override("separation", 8)
    bottom.add_child(buttons)
    _make_button(buttons, "STEEL COLOR", func() -> void: _cycle_color())
    _make_button(buttons, "PATTERN", func() -> void:
        pattern_strength = fmod(pattern_strength + 0.22, 1.05)
        _apply_look()
        _sync_web()
    )
    _make_button(buttons, "LIGHTING", func() -> void:
        key_light_power = 1.25 if key_light_power > 2.0 else 3.0
        _apply_look()
        _sync_web()
    )
    var foot := Label.new()
    foot.text = "ONE SWIPE  /  TWO RIGID BODIES  /  REPEAT"
    foot.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    foot.add_theme_font_size_override("font_size", 12)
    foot.add_theme_color_override("font_color", Color("#91a0ad"))
    bottom.add_child(foot)


func _make_button(parent: HBoxContainer, caption: String, on_press: Callable) -> void:
    var button := Button.new()
    button.text = caption
    button.custom_minimum_size = Vector2(0, 52)
    button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    button.add_theme_font_size_override("font_size", 13)
    button.add_theme_color_override("font_color", Color("#dfeef2"))
    var box := StyleBoxFlat.new()
    box.bg_color = Color("#203c50")
    box.set_corner_radius_all(13)
    box.border_color = Color("#4d8291")
    box.set_border_width_all(1)
    button.add_theme_stylebox_override("normal", box)
    var hover := box.duplicate()
    hover.bg_color = Color("#32596c")
    button.add_theme_stylebox_override("hover", hover)
    button.add_theme_stylebox_override("pressed", hover)
    parent.add_child(button)
    button.pressed.connect(on_press)


func _update_hud() -> void:
    if is_instance_valid(_score_label):
        _score_label.text = "CLEAN CUTS  /  %02d" % _cuts
    if is_instance_valid(_hint_label):
        _hint_label.text = "SPLIT!  -  REBUILDING TARGET..." if _target_split else "SWIPE THROUGH THE WOOD BLOCK"


func _sync_web() -> void:
    # Dedicated read-only test signal for Playwright; actual gameplay uses touch/mouse.
    if OS.has_feature("web"):
        var split_text := "true" if _target_split else "false"
        var js := "window.__MYBLADE={ready:true,cutCount:%d,split:%s,colorIndex:%d,pattern:%.2f,light:%.2f};" % [
            _cuts, split_text, _color_index, pattern_strength, key_light_power
        ]
        JavaScriptBridge.eval(js, true)
