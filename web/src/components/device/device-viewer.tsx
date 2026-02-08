'use client';

import { useEffect, useRef, useState } from 'react';
import { DeviceVideoPlayer } from '@/lib/device-video';
import { DeviceInputHandler } from '@/lib/device-input';

interface DeviceViewerProps {
  serial: string;
}

export function DeviceViewer({ serial }: DeviceViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<DeviceVideoPlayer | null>(null);
  const inputRef = useRef<DeviceInputHandler | null>(null);
  const [videoStatus, setVideoStatus] = useState('connecting');
  const [controlStatus, setControlStatus] = useState('connecting');
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    // Video player
    const player = new DeviceVideoPlayer(canvas);
    playerRef.current = player;
    player.setOnStatusChange(setVideoStatus);
    player.setOnFpsUpdate(setFps);
    player.connect(serial);

    // Input handler
    const input = new DeviceInputHandler(canvas);
    inputRef.current = input;
    input.setOnStatusChange(setControlStatus);
    input.connect(serial);

    // Make canvas focusable for keyboard events
    canvas.tabIndex = 0;
    canvas.focus();

    return () => {
      player.disconnect();
      input.disconnect();
      playerRef.current = null;
      inputRef.current = null;
    };
  }, [serial]);

  const statusColor = videoStatus === 'streaming' ? 'text-green-400' : 'text-yellow-400';

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3 text-xs">
          <span className={statusColor}>{videoStatus}</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400">Control: {controlStatus}</span>
          {fps > 0 && (
            <>
              <span className="text-gray-500">|</span>
              <span className="text-gray-400">{fps} fps</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => inputRef.current?.sendWake()}
            className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded"
          >
            Wake
          </button>
          <button
            onClick={() => inputRef.current?.sendScreenOff()}
            className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded"
          >
            Screen Off
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain"
          style={{ cursor: 'default' }}
        />
      </div>
    </div>
  );
}
