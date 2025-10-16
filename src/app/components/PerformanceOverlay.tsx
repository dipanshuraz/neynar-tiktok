// src/components/PerformanceOverlay.tsx - FPS Monitor for Development

'use client';

import { useEffect, useState, useRef } from 'react';
import { useLongTaskMonitor } from '../hooks/useLongTaskMonitor';
import { useMemoryMonitor, formatBytes, triggerGC } from '../hooks/useMemoryMonitor';
import { useVideoStartupMetrics, getStartupPerformanceStatus } from '../hooks/useVideoStartupMetrics';
import { useNetworkQuality, formatNetworkSpeed, getNetworkQualityColor } from '../hooks/useNetworkQuality';
import { useErrorMetrics, getErrorSeverity, getRecoveryRate } from '../hooks/useErrorMetrics';

interface PerformanceStats {
  fps: number;
  avgFps: number;
  minFps: number;
  droppedFrames: number;
  memoryUsage?: string;
}

export default function PerformanceOverlay() {
  const [stats, setStats] = useState<PerformanceStats>({
    fps: 60,
    avgFps: 60,
    minFps: 60,
    droppedFrames: 0,
  });
  const [isVisible, setIsVisible] = useState(true);
  const longTaskStats = useLongTaskMonitor(50);
  const memoryMetrics = useMemoryMonitor(5000, 5); // Check every 5s, leak threshold 5
  const startupMetrics = useVideoStartupMetrics();
  const networkInfo = useNetworkQuality();
  const errorMetrics = useErrorMetrics();
  const fpsHistoryRef = useRef<number[]>([]);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    let minFps = 60;
    let droppedFrames = 0;

    const measureFPS = () => {
      const now = performance.now();
      frameCountRef.current++;

      if (now >= lastTimeRef.current + 1000) {
        const fps = Math.round(
          (frameCountRef.current * 1000) / (now - lastTimeRef.current)
        );
        
        // Track FPS history
        fpsHistoryRef.current.push(fps);
        if (fpsHistoryRef.current.length > 30) {
          fpsHistoryRef.current.shift();
        }

        // Calculate stats
        const avgFps = Math.round(
          fpsHistoryRef.current.reduce((a, b) => a + b, 0) / 
          fpsHistoryRef.current.length
        );
        
        if (fps < minFps) minFps = fps;
        if (fps < 58) droppedFrames++;

        // Get memory usage if available
        let memoryUsage: string | undefined;
        if ('memory' in performance) {
          const memory = (performance as any).memory;
          const usedMB = (memory.usedJSHeapSize / 1024 / 1024).toFixed(1);
          const totalMB = (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1);
          memoryUsage = `${usedMB} / ${totalMB} MB`;
        }

        setStats({
          fps,
          avgFps,
          minFps,
          droppedFrames,
          memoryUsage,
        });

        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      rafIdRef.current = requestAnimationFrame(measureFPS);
    };

    rafIdRef.current = requestAnimationFrame(measureFPS);

    // Keyboard shortcut to toggle visibility (Shift + P)
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'P' && e.shiftKey) {
        setIsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  if (!isVisible || process.env.NODE_ENV !== 'development') {
    return null;
  }

  const getFpsColor = (fps: number) => {
    if (fps >= 58) return 'text-green-400';
    if (fps >= 45) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="fixed top-20 right-4 z-[9999] bg-black/90 backdrop-blur-md rounded-lg p-3 text-xs font-mono border border-white/20 shadow-xl">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
        <span className="text-white/60 font-semibold">Performance</span>
        <button
          onClick={() => setIsVisible(false)}
          className="text-white/40 hover:text-white/80 transition-colors text-xs"
        >
          ✕
        </button>
      </div>
      
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-white/60">FPS:</span>
          <span className={`font-bold ${getFpsColor(stats.fps)}`}>
            {stats.fps}
          </span>
        </div>
        
        <div className="flex items-center justify-between gap-4">
          <span className="text-white/60">Avg FPS:</span>
          <span className={`font-bold ${getFpsColor(stats.avgFps)}`}>
            {stats.avgFps}
          </span>
        </div>
        
        <div className="flex items-center justify-between gap-4">
          <span className="text-white/60">Min FPS:</span>
          <span className={`font-bold ${getFpsColor(stats.minFps)}`}>
            {stats.minFps}
          </span>
        </div>
        
        <div className="flex items-center justify-between gap-4">
          <span className="text-white/60">Dropped:</span>
          <span className={`font-bold ${stats.droppedFrames > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {stats.droppedFrames}
          </span>
        </div>
        
        {stats.memoryUsage && (
          <>
            <div className="h-px bg-white/10 my-2" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/60">Memory:</span>
              <span className="text-white text-[10px]">
                {stats.memoryUsage}
              </span>
            </div>
          </>
        )}

        {/* Long Tasks Section */}
        <div className="h-px bg-white/10 my-2" />
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-white/60">Long Tasks:</span>
            <span className={`font-bold ${longTaskStats.count > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {longTaskStats.count}
            </span>
          </div>
          
          {longTaskStats.longestDuration > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/60 text-[10px]">Longest:</span>
              <span className="text-white text-[10px]">
                {longTaskStats.longestDuration.toFixed(1)}ms
              </span>
            </div>
          )}
        </div>

        {/* Memory Section */}
        {memoryMetrics && (
          <>
            <div className="h-px bg-white/10 my-2" />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/60">Heap:</span>
                <span className={`font-bold text-[10px] ${
                  memoryMetrics.isLeaking ? 'text-red-400' :
                  memoryMetrics.percentage > 80 ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {memoryMetrics.percentage}%
                </span>
              </div>
              
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/60 text-[10px]">Used:</span>
                <span className="text-white text-[9px]">
                  {formatBytes(memoryMetrics.usedHeapSize)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/60 text-[10px]">Trend:</span>
                <span className={`text-[9px] ${
                  memoryMetrics.trend === 'increasing' ? 'text-red-400' :
                  memoryMetrics.trend === 'decreasing' ? 'text-green-400' : 'text-white'
                }`}>
                  {memoryMetrics.trend === 'increasing' ? '↗' : 
                   memoryMetrics.trend === 'decreasing' ? '↘' : '→'}
                </span>
              </div>

              {memoryMetrics.isLeaking && (
                <div className="text-red-400 text-[9px] font-bold">
                  ⚠️ Leak detected!
                </div>
              )}

              {/* GC Button */}
              <button
                onClick={() => triggerGC()}
                className="w-full mt-2 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[9px] text-white transition-colors"
              >
                🗑️ Force GC
              </button>
            </div>
          </>
        )}

        {/* Video Startup Section */}
        {startupMetrics.totalStartups > 0 && (
          <>
            <div className="h-px bg-white/10 my-2" />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/60">Startup:</span>
                <span className={`font-bold text-[10px] ${
                  startupMetrics.avgStartupTime < 200 ? 'text-green-400' : 'text-yellow-400'
                }`}>
                  {startupMetrics.avgStartupTime}ms
                </span>
              </div>
              
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/60 text-[10px]">Last:</span>
                <span className={`text-[9px] ${
                  startupMetrics.lastStartupTime < 200 ? 'text-green-400' : 'text-yellow-400'
                }`}>
                  {startupMetrics.lastStartupTime.toFixed(0)}ms
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/60 text-[10px]">Range:</span>
                <span className="text-white text-[9px]">
                  {startupMetrics.minStartupTime.toFixed(0)}-{startupMetrics.maxStartupTime.toFixed(0)}ms
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/60 text-[10px]">Total:</span>
                <span className="text-white text-[9px]">
                  {startupMetrics.totalStartups} starts
                </span>
              </div>
            </div>
          </>
        )}

        {/* Network Section */}
        <div className="h-px bg-white/10 my-2" />
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-white/60">Network:</span>
            <span className={`font-bold text-[10px] ${getNetworkQualityColor(networkInfo.speed)}`}>
              {networkInfo.speed.toUpperCase()}
            </span>
          </div>
          
          {networkInfo.effectiveType !== 'unknown' && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/60 text-[10px]">Type:</span>
              <span className="text-white text-[9px]">
                {networkInfo.effectiveType.toUpperCase()}
              </span>
            </div>
          )}

          {networkInfo.downlink && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/60 text-[10px]">Speed:</span>
              <span className="text-white text-[9px]">
                {formatNetworkSpeed(networkInfo.downlink)}
              </span>
            </div>
          )}

          {networkInfo.rtt !== undefined && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/60 text-[10px]">RTT:</span>
              <span className="text-white text-[9px]">
                {networkInfo.rtt}ms
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <span className="text-white/60 text-[10px]">Preload:</span>
            <span className="text-white text-[9px]">
              {networkInfo.maxPreloadCount === 0 ? 'Off' : 
               `${networkInfo.maxPreloadCount} (${networkInfo.preloadDirection})`}
            </span>
          </div>

          {networkInfo.saveData && (
            <div className="text-yellow-400 text-[9px] font-bold">
              📊 Data Saver ON
            </div>
          )}
        </div>

        {/* Error Metrics Section */}
        {errorMetrics.totalErrors > 0 && (
          <>
            <div className="h-px bg-white/10 my-2" />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/60">Errors:</span>
                <span className={`font-bold text-[10px] ${
                  getErrorSeverity(errorMetrics.errorRate) === 'good' ? 'text-green-400' :
                  getErrorSeverity(errorMetrics.errorRate) === 'warning' ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {errorMetrics.totalErrors}
                </span>
              </div>
              
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/60 text-[10px]">Error Rate:</span>
                <span className="text-white text-[9px]">
                  {errorMetrics.errorRate}%
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/60 text-[10px]">Recovered:</span>
                <span className={`text-[9px] ${
                  getRecoveryRate(errorMetrics) > 75 ? 'text-green-400' : 'text-yellow-400'
                }`}>
                  {errorMetrics.successfulRetries}/{errorMetrics.totalErrors}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/60 text-[10px]">Avg Retries:</span>
                <span className="text-white text-[9px]">
                  {errorMetrics.avgRetriesPerError}
                </span>
              </div>

              {errorMetrics.lastErrorType && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-white/60 text-[10px]">Last:</span>
                  <span className="text-red-400 text-[9px]">
                    {errorMetrics.lastErrorType}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      
      {/* FPS Bar */}
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              stats.fps >= 58 ? 'bg-green-400' :
              stats.fps >= 45 ? 'bg-yellow-400' : 'bg-red-400'
            }`}
            style={{ width: `${(stats.fps / 60) * 100}%` }}
          />
        </div>
        <div className="text-[9px] text-white/40 mt-1.5 text-center">
          Shift + P to toggle
        </div>
      </div>
    </div>
  );
}

