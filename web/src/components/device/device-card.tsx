'use client';

import { useEffect, useRef, useState } from 'react';
import { DeviceThumbnailPlayer } from '@/lib/device-video-thumbnail';
import { DeviceInfo } from '@/lib/api';

interface DeviceCardProps {
  device: DeviceInfo;
  onClick: () => void;
}

export function DeviceCard({ device, onClick }: DeviceCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<DeviceThumbnailPlayer | null>(null);
  const [status, setStatus] = useState<string>('idle');

  useEffect(() => {
    if (!device.has_session || !canvasRef.current) return;

    const player = new DeviceThumbnailPlayer(canvasRef.current);
    playerRef.current = player;

    player.setOnStatusChange(setStatus);
    player.connect(device.serial);

    return () => {
      player.disconnect();
      playerRef.current = null;
    };
  }, [device.serial, device.has_session]);

  const stateColor = device.state === 'device' ? 'bg-green-500' : 'bg-gray-500';

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-lg bg-gray-900 border border-gray-800 overflow-hidden hover:border-brand-500/50 transition-colors"
    >
      {/* Thumbnail area */}
      <div className="relative aspect-[9/16] bg-gray-950 flex items-center justify-center overflow-hidden">
        {device.has_session ? (
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-gray-600 text-xs">
            {device.state === 'device' ? 'No session' : 'Offline'}
          </div>
        )}

        {/* Status overlay */}
        {device.has_session && status !== 'streaming' && status !== 'idle' && (
          <div className="absolute inset-0 bg-gray-950/80 flex items-center justify-center">
            <span className="text-gray-400 text-xs">{status}</span>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="px-3 py-2 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${stateColor}`} />
          <span className="text-xs font-medium text-gray-200 truncate">
            {device.model || device.serial}
          </span>
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5 truncate">
          {device.serial}
        </div>
      </div>
    </div>
  );
}
