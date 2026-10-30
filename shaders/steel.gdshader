shader_type spatial;
render_mode cull_disabled, specular_schlick_ggx;

uniform vec4 steel_tint : source_color = vec4(0.73, 0.83, 0.93, 1.0);
uniform float pattern_strength : hint_range(0.0, 1.0) = 0.75;

void fragment() {
    float waves = sin(UV.y * 76.0 + sin(UV.x * 17.0 + UV.y * 8.0) * 3.3);
    waves += sin(UV.y * 131.0 - UV.x * 25.0) * 0.29;
    float folded = smoothstep(-0.25, 0.83, waves);
    float delta = (folded - 0.5) * pattern_strength;
    vec3 tinted = steel_tint.rgb * (1.0 + delta * 0.45);
    float edge = smoothstep(0.72, 1.0, UV.x);
    ALBEDO = mix(tinted, tinted * 1.24, edge * 0.44);
    METALLIC = 0.93;
    ROUGHNESS = clamp(0.29 + delta * 0.11, 0.16, 0.50);
    SPECULAR = 0.84;
}
