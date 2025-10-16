// src/utils/performance.ts
// Web Vitals types (optional dependency)
type Metric = {
  name: string;
  value: number;
  rating: string;
};

export interface PerformanceMetrics {
  cls: number;
  inp: number;
  fcp: number;
  lcp: number;
  ttfb: number;
}

class PerformanceMonitor {
  private metrics: Partial<PerformanceMetrics> = {};
  private listeners: Array<(metrics: PerformanceMetrics) => void> = [];
  private initialized = false;

  async init() {
    if (this.initialized || typeof window === 'undefined') return;
    
    try {
      // Try to import web-vitals if available
      const webVitals = await import('web-vitals').catch(() => null);
      
      if (!webVitals) {
        console.log('Web Vitals package not installed (optional)');
        return;
      }
      
      const { onCLS, onINP, onFCP, onLCP, onTTFB } = webVitals;
      
      const handleMetric = (metric: Metric) => {
        const name = metric.name.toLowerCase() as keyof PerformanceMetrics;
        this.metrics[name] = metric.value;

        if (process.env.NODE_ENV === 'development') {
          console.log(`📊 ${metric.name}:`, metric.value, metric.rating);
        }

        if (Object.keys(this.metrics).length === 5) {
          this.notifyListeners();
        }
      };

      onCLS(handleMetric);
      onINP(handleMetric);
      onFCP(handleMetric);
      onLCP(handleMetric);
      onTTFB(handleMetric);
      
      this.initialized = true;
    } catch (error) {
      console.warn('Web Vitals not available:', error);
    }
  }

  onMetricsReady(callback: (metrics: PerformanceMetrics) => void) {
    this.listeners.push(callback);

    if (Object.keys(this.metrics).length === 5) {
      callback(this.metrics as PerformanceMetrics);
    }
  }

  private notifyListeners() {
    const metrics = this.metrics as PerformanceMetrics;
    this.listeners.forEach(listener => listener(metrics));
  }

  getMetrics(): Partial<PerformanceMetrics> {
    return { ...this.metrics };
  }

  sendToAnalytics(analyticsEndpoint?: string) {
    if (!analyticsEndpoint) {
      console.log('📊 Performance Metrics:', this.metrics);
      return;
    }

    fetch(analyticsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metrics: this.metrics,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      }),
    }).catch(console.error);
  }
}

const monitor = new PerformanceMonitor();

export const performanceMonitor = {
  init: () => monitor.init(),
  onMetricsReady: (callback: (metrics: PerformanceMetrics) => void) => monitor.onMetricsReady(callback),
  getMetrics: () => monitor.getMetrics(),
  sendToAnalytics: (endpoint?: string) => monitor.sendToAnalytics(endpoint),
};

if (typeof window !== 'undefined') {
  performanceMonitor.init();
}

export class FPSMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 60;
  private rafId: number | null = null;
  private callback?: (fps: number) => void;

  start(callback?: (fps: number) => void) {
    this.callback = callback;
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.measure();
  }

  private measure = () => {
    const now = performance.now();
    this.frameCount++;

    if (now >= this.lastTime + 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
      this.frameCount = 0;
      this.lastTime = now;

      if (this.callback) {
        this.callback(this.fps);
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('🎯 FPS:', this.fps);
      }
    }

    this.rafId = requestAnimationFrame(this.measure);
  };

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getCurrentFPS(): number {
    return this.fps;
  }
}

export class MemoryMonitor {
  getMemoryUsage() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: this.formatBytes(memory.usedJSHeapSize),
        totalJSHeapSize: this.formatBytes(memory.totalJSHeapSize),
        jsHeapSizeLimit: this.formatBytes(memory.jsHeapSizeLimit),
        percentage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100),
      };
    }
    return null;
  }

  private formatBytes(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }

  logMemoryUsage() {
    const usage = this.getMemoryUsage();
    if (usage) {
      console.log('💾 Memory Usage:', usage);
    }
  }
}

export function getNetworkInfo() {
  if ('connection' in navigator) {
    const connection = (navigator as any).connection;
    return {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData,
    };
  }
  return null;
}

export class LongTaskMonitor {
  private observer: PerformanceObserver | null = null;
  private longTasks: PerformanceEntry[] = [];

  start() {
    if ('PerformanceObserver' in window) {
      try {
        this.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              this.longTasks.push(entry);
              console.warn('⚠️ Long Task detected:', {
                duration: `${entry.duration.toFixed(2)}ms`,
                name: entry.name,
                startTime: entry.startTime,
              });
            }
          }
        });

        this.observer.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        console.warn('Long task monitoring not supported');
      }
    }
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  getLongTasks() {
    return this.longTasks;
  }

  getStats() {
    return {
      count: this.longTasks.length,
      totalDuration: this.longTasks.reduce((sum, task) => sum + task.duration, 0),
      avgDuration: this.longTasks.length > 0
        ? this.longTasks.reduce((sum, task) => sum + task.duration, 0) / this.longTasks.length
        : 0,
    };
  }
}

export function reportPerformance() {
  console.group('📊 Performance Report');
  
  const metrics = performanceMonitor.getMetrics();
  console.log('Web Vitals:', metrics);
  
  const memory = new MemoryMonitor().getMemoryUsage();
  if (memory) {
    console.log('Memory:', memory);
  }
  
  const network = getNetworkInfo();
  if (network) {
    console.log('Network:', network);
  }
  
  console.groupEnd();
}