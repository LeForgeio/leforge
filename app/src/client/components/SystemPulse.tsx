import { useEffect, useRef, useState } from 'react';
import { Activity, Cpu, HardDrive } from 'lucide-react';
import { cn } from '../lib/utils';

interface MetricData {
  label: string;
  value: number;
  unit: string;
  icon: React.ElementType;
  color: string;
}

// Generate random walk values that stay within bounds
function generateSmoothValue(prev: number, min: number, max: number, volatility: number = 0.1): number {
  const range = max - min;
  const change = (Math.random() - 0.5) * range * volatility;
  const newValue = prev + change;
  return Math.max(min, Math.min(max, newValue));
}

export function SystemPulse() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<number[]>([]);
  const [metrics, setMetrics] = useState<MetricData[]>([
    { label: 'CPU', value: 23, unit: '%', icon: Cpu, color: 'from-indigo-500 to-violet-500' },
    { label: 'Memory', value: 512, unit: 'MB', icon: HardDrive, color: 'from-emerald-500 to-teal-500' },
    { label: 'Requests/min', value: 42, unit: '', icon: Activity, color: 'from-amber-500 to-orange-500' },
  ]);

  // Update metrics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => prev.map(metric => ({
        ...metric,
        value: metric.label === 'CPU' 
          ? Math.round(generateSmoothValue(metric.value, 5, 45, 0.15))
          : metric.label === 'Memory'
          ? Math.round(generateSmoothValue(metric.value, 400, 800, 0.1))
          : Math.round(generateSmoothValue(metric.value, 20, 80, 0.2))
      })));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Draw the ECG-style animation
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = 60 * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = '60px';
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize data
    const width = container.getBoundingClientRect().width;
    const points = Math.ceil(width / 2);
    if (dataRef.current.length === 0) {
      dataRef.current = new Array(points).fill(30);
    }

    let animationId: number;
    let offset = 0;

    const draw = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = 60;
      const midY = h / 2;

      // Clear canvas
      ctx.clearRect(0, 0, w, h);

      // Generate new point with ECG-like pattern
      offset++;
      const cycle = offset % 60;
      let newValue: number;
      
      if (cycle === 0) {
        // Small P wave
        newValue = midY - 8;
      } else if (cycle === 5) {
        // Return to baseline
        newValue = midY;
      } else if (cycle === 10) {
        // Q dip
        newValue = midY + 5;
      } else if (cycle === 12) {
        // R peak (sharp spike up)
        newValue = midY - 25;
      } else if (cycle === 14) {
        // S dip
        newValue = midY + 8;
      } else if (cycle === 18) {
        // Return to baseline
        newValue = midY;
      } else if (cycle === 30) {
        // T wave
        newValue = midY - 10;
      } else if (cycle === 40) {
        // Return to baseline
        newValue = midY;
      } else {
        // Baseline with slight noise
        newValue = midY + (Math.random() - 0.5) * 2;
      }

      // Add variation based on "system load"
      const loadFactor = metrics[0].value / 100;
      newValue += (Math.random() - 0.5) * 4 * loadFactor;

      dataRef.current.push(newValue);
      if (dataRef.current.length > points) {
        dataRef.current.shift();
      }

      // Draw gradient background glow
      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0)');
      gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.05)');
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // Draw the line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Create glow effect
      ctx.shadowColor = 'rgba(99, 102, 241, 0.8)';
      ctx.shadowBlur = 10;

      for (let i = 0; i < dataRef.current.length; i++) {
        const x = (i / dataRef.current.length) * w;
        const y = dataRef.current[i];
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw a brighter leading edge
      const lastX = w;
      const lastY = dataRef.current[dataRef.current.length - 1];
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(129, 140, 248, 1)';
      ctx.shadowColor = 'rgba(129, 140, 248, 1)';
      ctx.shadowBlur = 15;
      ctx.fill();

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [metrics]);

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-gray-900/80 via-gray-800/80 to-gray-900/80 border border-white/10 backdrop-blur-sm">
      {/* ECG Canvas */}
      <div ref={containerRef} className="relative h-[60px] w-full">
        <canvas ref={canvasRef} className="absolute inset-0" />
        
        {/* Scanline effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent pointer-events-none" />
        
        {/* Grid overlay */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px'
          }}
        />
      </div>

      {/* Metrics overlay */}
      <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-medium text-emerald-400">System Online</span>
          </div>
        </div>

        {/* Metric pills */}
        <div className="flex items-center gap-3">
          {metrics.map((metric) => (
            <div 
              key={metric.label}
              title={
                metric.label === 'CPU' ? 'CPU Usage - Current processor utilization across all cores' :
                metric.label === 'Memory' ? 'Memory Usage - RAM consumed by FlowForge services' :
                'Requests/min - API calls processed in the last minute'
              }
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 cursor-help"
            >
              <metric.icon className={cn('w-3.5 h-3.5', 
                metric.label === 'CPU' ? 'text-indigo-400' :
                metric.label === 'Memory' ? 'text-emerald-400' : 'text-amber-400'
              )} />
              <span className="text-xs font-medium text-white/90">
                {metric.value}{metric.unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SystemPulse;
