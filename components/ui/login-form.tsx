"use client";
import { useEffect, useRef, useState } from "react";
import { User, Lock, ArrowRight, Eye, EyeOff, Mail, AtSign, GraduationCap } from 'lucide-react';
import { GlowCard } from "./spotlight-card";

const vertexSmokeySource = `
  attribute vec4 a_position;
  void main() {
    gl_Position = a_position;
  }
`;

const fragmentSmokeySource = `
precision mediump float;

uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform vec3 u_color;

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 uv = fragCoord / iResolution;
    vec2 centeredUV = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);

    float time = iTime * 0.5;

    vec2 mouse = iMouse / iResolution;
    vec2 rippleCenter = 2.0 * mouse - 1.0;

    vec2 distortion = centeredUV;
    for (float i = 1.0; i < 8.0; i++) {
        distortion.x += 0.5 / i * cos(i * 2.0 * distortion.y + time + rippleCenter.x * 3.1415);
        distortion.y += 0.5 / i * cos(i * 2.0 * distortion.x + time + rippleCenter.y * 3.1415);
    }

    float wave = abs(sin(distortion.x + distortion.y + time));
    float glow = smoothstep(0.9, 0.2, wave);

    fragColor = vec4(u_color * glow, 1.0);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

type BlurSize = "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

interface SmokeyBackgroundProps {
  backdropBlurAmount?: string;
  color?: string;
  className?: string;
}

const blurClassMap: Record<BlurSize, string> = {
  none: "backdrop-blur-none",
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
  lg: "backdrop-blur-lg",
  xl: "backdrop-blur-xl",
  "2xl": "backdrop-blur-2xl",
  "3xl": "backdrop-blur-3xl",
};

export function SmokeyBackground({
  backdropBlurAmount = "sm",
  color = "#7C3AED",
  className = "",
}: SmokeyBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const hexToRgb = (hex: string): [number, number, number] => {
    const r = parseInt(hex.substring(1, 3), 16) / 255;
    const g = parseInt(hex.substring(3, 5), 16) / 255;
    const b = parseInt(hex.substring(5, 7), 16) / 255;
    return [r, g, b];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSmokeySource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSmokeySource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const iResolutionLocation = gl.getUniformLocation(program, "iResolution");
    const iTimeLocation = gl.getUniformLocation(program, "iTime");
    const iMouseLocation = gl.getUniformLocation(program, "iMouse");
    const uColorLocation = gl.getUniformLocation(program, "u_color");

    const startTime = Date.now();
    const [r, g, b] = hexToRgb(color);
    gl.uniform3f(uColorLocation, r, g, b);

    let animFrameId: number;

    const render = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      const currentTime = (Date.now() - startTime) / 1000;
      gl.uniform2f(iResolutionLocation, width, height);
      gl.uniform1f(iTimeLocation, currentTime);
      gl.uniform2f(iMouseLocation,
        isHovering ? mousePosition.x : width / 2,
        isHovering ? height - mousePosition.y : height / 2
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animFrameId = requestAnimationFrame(render);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    const handleMouseEnter = () => setIsHovering(true);
    const handleMouseLeave = () => setIsHovering(false);

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseenter", handleMouseEnter);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    render();

    return () => {
      cancelAnimationFrame(animFrameId);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseenter", handleMouseEnter);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [isHovering, mousePosition, color]);

  const finalBlurClass = blurClassMap[backdropBlurAmount as BlurSize] || blurClassMap["sm"];

  return (
    <div className={`absolute inset-0 w-full h-full overflow-hidden ${className}`}>
      <div style={{ opacity: 0.45, width: '100%', height: '100%' }}>
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
      <div className={`absolute inset-0 ${finalBlurClass}`} />
    </div>
  );
}

const STATES_CITIES: Record<string, string[]> = {
  "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Tirupati"],
  "Bihar": ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur"],
  "Delhi": ["New Delhi", "Dwarka", "Rohini", "Saket"],
  "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot"],
  "Haryana": ["Gurugram", "Faridabad", "Ambala", "Hisar"],
  "Himachal Pradesh": ["Shimla", "Manali", "Dharamsala", "Kullu"],
  "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro"],
  "Karnataka": ["Bengaluru", "Mysuru", "Mangaluru", "Hubli"],
  "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur"],
  "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur"],
  "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad"],
  "Punjab": ["Chandigarh", "Amritsar", "Ludhiana", "Jalandhar"],
  "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli"],
  "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar"],
  "Uttar Pradesh": ["Lucknow", "Kanpur", "Agra", "Varanasi", "Prayagraj"],
  "Uttarakhand": ["Dehradun", "Haridwar", "Rishikesh", "Nainital"],
  "West Bengal": ["Kolkata", "Siliguri", "Howrah", "Asansol"],
};

const inputStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
};

const focusHandlers = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.border = '1px solid #7C3AED';
    e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)';
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.border = '1px solid rgba(255,255,255,0.1)';
    e.target.style.boxShadow = 'none';
  },
};

const inputClass = "w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-gray-600 outline-none transition-all duration-200";
const selectClass = "w-full pl-4 pr-4 py-3 rounded-xl text-sm text-white outline-none transition-all duration-200 appearance-none cursor-pointer";

export function LoginForm({ onLoginSuccess }: { onLoginSuccess?: (data: { name: string; username: string }) => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  
  // User data state
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");

  const cities = selectedState ? STATES_CITIES[selectedState] ?? [] : [];

  const cardTitle = isSignUp ? "Create Account" : "Welcome Back";
  const cardSubtitle = isSignUp ? "Sign up to get started" : "Sign in to continue";

  return (
    <GlowCard
      glowColor="purple"
      customSize
      width="100%"
      animationOffset={0}
      duration={6000}
      backdropColor="#111111"
      className="w-full max-w-md mx-4 flex flex-col backdrop-blur-none"
      style={{
        padding: '48px',
        background: '#111111',
        animation: 'cardEntrance 0.4s ease-out forwards',
      }}
    >
      {/* Brand */}
      <div className="text-center mb-8 space-y-2">
        <p className="text-sm font-semibold animated-gradient-text tracking-wide">
          LastDayLLM
        </p>
        <h2 className="text-4xl font-bold text-white">{cardTitle}</h2>
        <p className="text-sm" style={{ color: '#888' }}>{cardSubtitle}</p>
      </div>

      {/* ── LOGIN FORM ── */}
      {!isSignUp && (
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault();
          if (onLoginSuccess) {
            onLoginSuccess({ 
              name: name || "Student", 
              username: username || email.split('@')[0] || "user" 
            });
          }
        }}>
          {/* Email */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#555' }} />
            <input 
              type="email" 
              placeholder="Email address" 
              required 
              className={inputClass} 
              style={inputStyle} 
              value={email}
              onChange={e => setEmail(e.target.value)}
              {...focusHandlers} 
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#555' }} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              required
              className={inputClass}
              style={inputStyle}
              {...focusHandlers}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
              style={{ color: '#555' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
              onMouseLeave={e => (e.currentTarget.style.color = '#555')}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Forgot Password */}
          <div className="flex justify-end">
            <a href="#" className="text-xs transition-all duration-200" style={{ color: '#666' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#7C3AED'; e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.textDecoration = 'none'; }}
            >
              Forgot Password?
            </a>
          </div>

          {/* Sign In Button */}
          <button type="submit"
            className="group w-full flex items-center justify-center py-3 px-4 rounded-xl text-white font-semibold transition-all duration-200"
            style={{ background: '#7C3AED' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#8B5CF6'; e.currentTarget.style.boxShadow = '0 0 24px rgba(124,58,237,0.45)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#7C3AED'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            Sign In
            <ArrowRight className="ml-2 h-4 w-4 transform group-hover:translate-x-1 transition-transform duration-200" />
          </button>

          {/* Divider */}
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }} />
            <span className="flex-shrink mx-4 text-xs tracking-widest uppercase" style={{ color: '#444' }}>or continue with</span>
            <div className="flex-grow border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }} />
          </div>

          {/* Google Button */}
          <button type="button"
            className="w-full flex items-center justify-center py-3 px-4 rounded-xl text-white font-medium transition-all duration-200"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.border = '1px solid rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.border = '1px solid rgba(255,255,255,0.12)'; }}
            onClick={() => { /* TODO: Wire Google OAuth */ }}
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039L38.802 8.841C34.553 4.806 29.613 2.5 24 2.5C11.983 2.5 2.5 11.983 2.5 24s9.483 21.5 21.5 21.5S45.5 36.017 45.5 24c0-1.538-.135-3.022-.389-4.417z"/>
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12.5 24 12.5c3.059 0 5.842 1.154 7.961 3.039l5.839-5.841C34.553 4.806 29.613 2.5 24 2.5C16.318 2.5 9.642 6.723 6.306 14.691z"/>
              <path fill="#4CAF50" d="M24 45.5c5.613 0 10.553-2.306 14.802-6.341l-5.839-5.841C30.842 35.846 27.059 38 24 38c-5.039 0-9.345-2.608-11.124-6.481l-6.571 4.819C9.642 41.277 16.318 45.5 24 45.5z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l5.839 5.841C44.196 35.123 45.5 29.837 45.5 24c0-1.538-.135-3.022-.389-4.417z"/>
            </svg>
            Sign in with Google
          </button>
        </form>
      )}

      {/* ── SIGN UP FORM ── */}
      {isSignUp && (
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault();
          if (onLoginSuccess) {
            onLoginSuccess({ name, username });
          }
        }}>
          {/* Name */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#555' }} />
            <input 
              type="text" 
              placeholder="Full name" 
              required 
              className={inputClass} 
              style={inputStyle} 
              value={name}
              onChange={e => setName(e.target.value)}
              {...focusHandlers} 
            />
          </div>

          {/* Email */}
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#555' }} />
            <input 
              type="email" 
              placeholder="Email address" 
              required 
              className={inputClass} 
              style={inputStyle} 
              value={email}
              onChange={e => setEmail(e.target.value)}
              {...focusHandlers} 
            />
          </div>

          {/* Username */}
          <div className="relative">
            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#555' }} />
            <input 
              type="text" 
              placeholder="Username" 
              required 
              className={inputClass} 
              style={inputStyle} 
              value={username}
              onChange={e => setUsername(e.target.value)}
              {...focusHandlers} 
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#555' }} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              required
              className={inputClass}
              style={inputStyle}
              {...focusHandlers}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
              style={{ color: '#555' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
              onMouseLeave={e => (e.currentTarget.style.color = '#555')}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Confirm Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#555' }} />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm password"
              required
              className={inputClass}
              style={inputStyle}
              {...focusHandlers}
            />
            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
              style={{ color: '#555' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
              onMouseLeave={e => (e.currentTarget.style.color = '#555')}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* State + City */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <select
                required
                value={selectedState}
                onChange={e => { setSelectedState(e.target.value); setSelectedCity(""); }}
                className={selectClass}
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid #7C3AED'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)'; }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
              >
                <option value="" disabled style={{ background: '#111' }}>State</option>
                {Object.keys(STATES_CITIES).sort().map(s => (
                  <option key={s} value={s} style={{ background: '#111' }}>{s}</option>
                ))}
              </select>
            </div>
            <div className="relative flex-1">
              <select
                required
                value={selectedCity}
                onChange={e => setSelectedCity(e.target.value)}
                className={selectClass}
                style={{ ...inputStyle, opacity: selectedState ? 1 : 0.5 }}
                onFocus={e => { e.target.style.border = '1px solid #7C3AED'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)'; }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
              >
                <option value="" disabled style={{ background: '#111' }}>City</option>
                {cities.map(c => (
                  <option key={c} value={c} style={{ background: '#111' }}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* University */}
          <div className="relative">
            <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#555' }} />
            <input type="text" placeholder="University name" required className={inputClass} style={inputStyle} {...focusHandlers} />
          </div>

          {/* Sign Up Button */}
          <button type="submit"
            className="group w-full flex items-center justify-center py-3 px-4 rounded-xl text-white font-semibold transition-all duration-200 mt-2"
            style={{ background: '#7C3AED' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#8B5CF6'; e.currentTarget.style.boxShadow = '0 0 24px rgba(124,58,237,0.45)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#7C3AED'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            Create Account
            <ArrowRight className="ml-2 h-4 w-4 transform group-hover:translate-x-1 transition-transform duration-200" />
          </button>
        </form>
      )}

      {/* Footer link */}
      <p className="text-center text-xs mt-6" style={{ color: '#555' }}>
        {isSignUp ? "Already have an account? " : "Don't have an account? "}
        <button
          type="button"
          className="font-semibold transition-all duration-200 bg-transparent border-none p-0 cursor-pointer"
          style={{ color: '#7C3AED' }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          onClick={() => { setIsSignUp(!isSignUp); setShowPassword(false); setShowConfirmPassword(false); setSelectedState(""); setSelectedCity(""); }}
        >
          {isSignUp ? "Sign In" : "Sign Up"}
        </button>
      </p>
    </GlowCard>
  );
}

