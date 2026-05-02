import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Settings, Menu, Link as LinkIcon, User, Globe, Cookie as CookieIcon, Lock, Play, Square, AlertCircle, Search, Tv, ListVideo, Download, Upload } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { VideoPlayer } from './components/VideoPlayer';

// Define a list of 10 proxies (placeholders that users can edit)
const DEFAULT_PROXIES = [
  { id: 1, name: 'Proxy 1 (US)', url: 'http://user:pass@us.proxy.example.com:8080' },
  { id: 2, name: 'Proxy 2 (UK)', url: 'http://user:pass@uk.proxy.example.com:8080' },
  { id: 3, name: 'Proxy 3 (DE)', url: 'http://user:pass@de.proxy.example.com:8080' },
  { id: 4, name: 'Proxy 4 (FR)', url: 'http://user:pass@fr.proxy.example.com:8080' },
  { id: 5, name: 'Proxy 5 (NL)', url: 'http://user:pass@nl.proxy.example.com:8080' },
  { id: 6, name: 'Proxy 6 (CA)', url: 'http://user:pass@ca.proxy.example.com:8080' },
  { id: 7, name: 'Proxy 7 (SG)', url: 'http://user:pass@sg.proxy.example.com:8080' },
  { id: 8, name: 'Proxy 8 (JP)', url: 'http://user:pass@jp.proxy.example.com:8080' },
  { id: 9, name: 'Proxy 9 (AU)', url: 'http://user:pass@au.proxy.example.com:8080' },
  { id: 10, name: 'Proxy 10 (BR)', url: 'http://user:pass@br.proxy.example.com:8080' },
];

interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
}

export default function App() {
  // Playlist State
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [filteredChannels, setFilteredChannels] = useState<Channel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);

  // Player & Network State
  const [streamUrl, setStreamUrl] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [referer, setReferer] = useState('');
  const [cookie, setCookie] = useState('');
  const [drmKey, setDrmKey] = useState('');
  
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [selectedProxy, setSelectedProxy] = useState(DEFAULT_PROXIES[0].url);
  const [customProxy, setCustomProxy] = useState('');
  const [useCustomProxy, setUseCustomProxy] = useState(false);
  const [useBackend, setUseBackend] = useState(true);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse M3U content
  const parseM3U = (text: string): Channel[] => {
    const lines = text.split('\n');
    const result: Channel[] = [];
    let currentChannel: Partial<Channel> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        const commaIndex = line.lastIndexOf(',');
        currentChannel.name = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : 'Unknown Channel';

        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        if (logoMatch) currentChannel.logo = logoMatch[1];

        const groupMatch = line.match(/group-title="([^"]+)"/);
        if (groupMatch) currentChannel.group = groupMatch[1];
      } else if (!line.startsWith('#')) {
        currentChannel.url = line;
        currentChannel.id = Math.random().toString(36).substring(2, 11);
        result.push(currentChannel as Channel);
        currentChannel = {};
      }
    }
    return result;
  };

  // Load Playlist from Local File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingPlaylist(true);
    setError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsedChannels = parseM3U(text);
        
        setChannels(parsedChannels);
        setFilteredChannels(parsedChannels);
        
        if (parsedChannels.length === 0) {
          setError('No channels found in the uploaded file.');
        }
      } catch (err: any) {
        setError('Failed to parse the file.');
      } finally {
        setIsLoadingPlaylist(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
      setIsLoadingPlaylist(false);
    };
    reader.readAsText(file);
  };

  // Load Playlist
  const handleLoadPlaylist = async () => {
    if (!playlistUrl) return;
    setIsLoadingPlaylist(true);
    setError('');
    try {
      const proxyEndpoint = '/api/proxy';
      const params = new URLSearchParams();
      params.append('url', playlistUrl);
      params.append('raw', 'true'); // Get raw content, don't rewrite
      
      if (proxyEnabled) {
        const proxyToUse = useCustomProxy ? customProxy : selectedProxy;
        if (proxyToUse) params.append('proxy', proxyToUse);
      }
      if (userAgent) params.append('userAgent', userAgent);
      if (referer) params.append('referer', referer);
      if (cookie) params.append('cookie', cookie);

      const res = await fetch(`${proxyEndpoint}?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch playlist');
      
      const text = await res.text();
      const parsedChannels = parseM3U(text);
      
      setChannels(parsedChannels);
      setFilteredChannels(parsedChannels);
      
      if (parsedChannels.length === 0) {
        setError('No channels found in the playlist.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load playlist');
    } finally {
      setIsLoadingPlaylist(false);
    }
  };

  // Search Filter
  useEffect(() => {
    if (!searchQuery) {
      setFilteredChannels(channels);
    } else {
      const lowerQuery = searchQuery.toLowerCase();
      setFilteredChannels(
        channels.filter(c => 
          c.name.toLowerCase().includes(lowerQuery) || 
          c.group?.toLowerCase().includes(lowerQuery)
        )
      );
    }
  }, [searchQuery, channels]);

  // Play Channel
  const handlePlayChannel = (channel: Channel) => {
    setActiveChannel(channel);
    setStreamUrl(channel.url);
    setError('');
    
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setIsPlaying(true);
  };

  // Direct Connect (for single stream URL)
  const handleDirectConnect = () => {
    setError('');
    if (!streamUrl) {
      setError('Please enter a stream URL');
      return;
    }
    setActiveChannel(null); // Clear active channel if playing direct URL
    setIsPlaying(true);
  };

  const handleStop = () => {
    setIsPlaying(false);
  };

  // Generate final URL based on proxy settings
  const finalStreamUrl = useMemo(() => {
    if (!streamUrl) return '';
    
    let finalUrl = streamUrl;
    if (useBackend) {
      const proxyEndpoint = '/api/proxy';
      const params = new URLSearchParams();
      params.append('url', streamUrl);
      
      if (proxyEnabled) {
        const proxyToUse = useCustomProxy ? customProxy : selectedProxy;
        if (proxyToUse) params.append('proxy', proxyToUse);
      }
      
      if (userAgent) params.append('userAgent', userAgent);
      if (referer) params.append('referer', referer);
      if (cookie) params.append('cookie', cookie);
      
      finalUrl = `${proxyEndpoint}?${params.toString()}`;
    }
    return finalUrl;
  }, [streamUrl, useBackend, proxyEnabled, useCustomProxy, customProxy, selectedProxy, userAgent, referer, cookie]);

  const videoJsOptions = useMemo(() => {
    if (!finalStreamUrl) return null;
    return {
      autoplay: true,
      controls: true,
      responsive: true,
      fluid: true,
      sources: [{
        src: finalStreamUrl,
        type: finalStreamUrl.includes('.mpd') ? 'application/dash+xml' : 'application/x-mpegURL'
      }]
    };
  }, [finalStreamUrl]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-yellow-500/30 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-[#0f0f0f] p-4 flex items-center justify-between shrink-0 z-10">
        <Settings className="w-6 h-6 text-yellow-500 cursor-pointer hover:text-yellow-400 transition-colors" />
        <h1 className="text-yellow-500 font-bold tracking-wider text-sm">M3U PROXY PLAYER</h1>
        <Menu className="w-6 h-6 text-yellow-500 cursor-pointer hover:text-yellow-400 transition-colors" />
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Sidebar - Channel List */}
        <aside className="w-full md:w-80 lg:w-96 border-r border-zinc-800 bg-[#0f0f0f] flex flex-col h-[40vh] md:h-[calc(100vh-65px)] shrink-0">
          
          {/* Playlist Input Area */}
          <div className="p-4 border-b border-zinc-800 space-y-3 shrink-0">
            <h2 className="text-yellow-500 text-xs font-bold tracking-widest flex items-center gap-2 uppercase">
              <ListVideo className="w-4 h-4" /> Load Playlist (M3U)
            </h2>
            <div className="flex gap-2">
              <div className="flex-1 bg-[#141414] border border-zinc-800 rounded-lg p-1 focus-within:border-yellow-500/50 transition-colors">
                <input
                  type="text"
                  placeholder="Enter M3U URL..."
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLoadPlaylist()}
                  className="w-full bg-transparent border-none outline-none p-2 text-sm text-white placeholder:text-zinc-600"
                />
              </div>
              <button 
                onClick={handleLoadPlaylist}
                disabled={isLoadingPlaylist || !playlistUrl}
                className="bg-yellow-500 text-black px-4 rounded-lg font-bold hover:bg-yellow-400 disabled:opacity-50 transition-colors flex items-center justify-center shrink-0"
              >
                {isLoadingPlaylist ? (
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-zinc-800"></div>
              <span className="flex-shrink-0 mx-4 text-zinc-600 text-[10px] uppercase tracking-widest font-bold">OR</span>
              <div className="flex-grow border-t border-zinc-800"></div>
            </div>

            <div className="flex gap-2">
              <input
                type="file"
                accept=".m3u,.m3u8"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-zinc-800 text-zinc-300 px-4 py-2.5 rounded-lg font-bold hover:bg-zinc-700 hover:text-white transition-colors flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
              >
                <Upload className="w-4 h-4" /> Upload Local M3U
              </button>
            </div>
          </div>

          {/* Search Area */}
          {channels.length > 0 && (
            <div className="p-4 border-b border-zinc-800 shrink-0">
              <div className="bg-[#141414] border border-zinc-800 rounded-lg p-1 flex items-center focus-within:border-yellow-500/50 transition-colors">
                <Search className="w-4 h-4 text-zinc-500 ml-2" />
                <input
                  type="text"
                  placeholder="Search channels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none outline-none p-2 text-sm text-white placeholder:text-zinc-600"
                />
              </div>
            </div>
          )}

          {/* Channel List */}
          <div className="flex-1 p-2 min-h-0">
            {channels.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-2 p-4 text-center">
                <Tv className="w-8 h-8 opacity-50" />
                <p className="text-sm">Load an M3U playlist to see channels here.</p>
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className="text-center p-4 text-sm text-zinc-500">
                No channels found matching "{searchQuery}".
              </div>
            ) : (
              <Virtuoso
                style={{ height: '100%' }}
                data={filteredChannels}
                itemContent={(index, channel) => (
                  <div className="pb-1">
                    <button
                      onClick={() => handlePlayChannel(channel)}
                      className={`w-full text-left p-2 rounded-lg flex items-center gap-3 transition-colors group
                        ${activeChannel?.id === channel.id ? 'bg-yellow-500/10 border border-yellow-500/30' : 'hover:bg-zinc-800/50 border border-transparent'}
                      `}
                    >
                      <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                        {channel.logo ? (
                          <img 
                            src={channel.logo} 
                            alt={channel.name} 
                            className="w-full h-full object-contain" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).parentElement?.classList.add('fallback-icon');
                            }} 
                          />
                        ) : (
                          <Tv className="w-5 h-5 text-zinc-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`text-sm font-medium truncate ${activeChannel?.id === channel.id ? 'text-yellow-500' : 'text-zinc-200 group-hover:text-white'}`}>
                          {channel.name}
                        </h3>
                        {channel.group && (
                          <p className="text-xs text-zinc-500 truncate">{channel.group}</p>
                        )}
                      </div>
                      {activeChannel?.id === channel.id && <Play className="w-4 h-4 text-yellow-500 shrink-0" />}
                    </button>
                  </div>
                )}
              />
            )}
          </div>
        </aside>

        {/* Main Content - Player & Settings */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto h-[60vh] md:h-[calc(100vh-65px)]">
          <div className="max-w-4xl mx-auto space-y-6 pb-20">
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Video Player Area */}
            <div className="w-full bg-black aspect-video rounded-lg overflow-hidden border border-zinc-800 shadow-2xl relative group flex items-center justify-center">
              {!isPlaying && !streamUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 space-y-4">
                  <Play className="w-16 h-16 opacity-20" />
                  <p className="text-sm font-medium tracking-widest uppercase">Select a channel or enter stream URL</p>
                </div>
              )}
              {isPlaying && videoJsOptions && (
                <VideoPlayer options={videoJsOptions} />
              )}
              {isPlaying && (
                <button 
                  onClick={handleStop}
                  className="absolute top-4 right-4 bg-red-500/80 hover:bg-red-500 text-white p-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 text-sm font-medium z-10"
                >
                  <Square className="w-4 h-4 fill-current" /> Stop
                </button>
              )}
            </div>

            {/* Active Channel Info */}
            {activeChannel && (
              <div className="bg-[#141414] border border-zinc-800 rounded-lg p-4 flex items-center gap-4">
                {activeChannel.logo ? (
                  <div className="w-16 h-16 rounded bg-zinc-900 flex items-center justify-center shrink-0 p-2">
                    <img src={activeChannel.logo} alt={activeChannel.name} className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded bg-zinc-900 flex items-center justify-center shrink-0">
                    <Tv className="w-8 h-8 text-zinc-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-white truncate">{activeChannel.name}</h2>
                  <p className="text-sm text-zinc-400 truncate">{activeChannel.group || 'Uncategorized'}</p>
                </div>
              </div>
            )}

            {/* Direct Stream Connection */}
            <section className="space-y-4">
              <h2 className="text-yellow-500 text-xs font-bold tracking-widest flex items-center gap-2 uppercase">
                <LinkIcon className="w-4 h-4" /> Direct Stream Connection
              </h2>
              <div className="flex gap-2">
                <div className="flex-1 bg-[#141414] border border-zinc-800 rounded-lg p-1 focus-within:border-yellow-500/50 transition-colors">
                  <input
                    type="text"
                    placeholder="Direct Stream URL (m3u8, mpd)"
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    className="w-full bg-transparent border-none outline-none p-3 text-sm text-white placeholder:text-zinc-600"
                  />
                </div>
                <button
                  onClick={isPlaying && !activeChannel ? handleStop : handleDirectConnect}
                  className={`px-6 rounded-lg font-bold tracking-widest uppercase transition-all duration-200 flex items-center justify-center gap-2 shrink-0
                    ${isPlaying && !activeChannel
                      ? 'bg-zinc-800 text-white hover:bg-zinc-700' 
                      : 'bg-yellow-500 text-black hover:bg-yellow-400 hover:shadow-[0_0_20px_rgba(234,179,8,0.3)]'
                    }`}
                >
                  {isPlaying && !activeChannel ? (
                    <Square className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                </button>
              </div>
            </section>

            {/* Proxy Settings */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-yellow-500 text-xs font-bold tracking-widest flex items-center gap-2 uppercase">
                  <Globe className="w-4 h-4" /> Proxy Settings
                </h2>
              </div>

              <div className="bg-[#141414] border border-zinc-800 rounded-lg p-4 space-y-6">
                
                {/* Use Backend Toggle */}
                <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">Route through Backend (Bypass CORS)</h3>
                    <p className="text-xs text-zinc-500 mt-1">Required for most streams to bypass browser CORS restrictions. Disable only if the stream supports CORS directly.</p>
                  </div>
                  <label className="flex items-center cursor-pointer gap-2 shrink-0">
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={useBackend}
                        onChange={() => setUseBackend(!useBackend)}
                      />
                      <div className={`block w-10 h-6 rounded-full transition-colors ${useBackend ? 'bg-yellow-500' : 'bg-zinc-700'}`}></div>
                      <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${useBackend ? 'transform translate-x-4' : ''}`}></div>
                    </div>
                  </label>
                </div>

                {/* External Proxy Toggle */}
                <div className={`flex items-center justify-between ${!useBackend ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div>
                    <h3 className="text-sm font-bold text-white">Use External Proxy</h3>
                    <p className="text-xs text-zinc-500 mt-1">Mask the backend server's IP address with a custom proxy.</p>
                  </div>
                  <label className="flex items-center cursor-pointer gap-2 shrink-0">
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={proxyEnabled}
                        onChange={() => setProxyEnabled(!proxyEnabled)}
                        disabled={!useBackend}
                      />
                      <div className={`block w-10 h-6 rounded-full transition-colors ${proxyEnabled ? 'bg-yellow-500' : 'bg-zinc-700'}`}></div>
                      <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${proxyEnabled ? 'transform translate-x-4' : ''}`}></div>
                    </div>
                  </label>
                </div>

                {proxyEnabled && useBackend && (
                  <div className="pt-4 border-t border-zinc-800 space-y-4">
                    <div className="flex items-center gap-4 mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio" 
                          name="proxyType" 
                          checked={!useCustomProxy} 
                          onChange={() => setUseCustomProxy(false)}
                          className="text-yellow-500 focus:ring-yellow-500 bg-zinc-800 border-zinc-700"
                        />
                        <span className="text-sm">Select from list</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio" 
                          name="proxyType" 
                          checked={useCustomProxy} 
                          onChange={() => setUseCustomProxy(true)}
                          className="text-yellow-500 focus:ring-yellow-500 bg-zinc-800 border-zinc-700"
                        />
                        <span className="text-sm">Custom Proxy</span>
                      </label>
                    </div>

                    {!useCustomProxy ? (
                      <div className="space-y-2">
                        <select 
                          value={selectedProxy}
                          onChange={(e) => setSelectedProxy(e.target.value)}
                          className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md p-3 text-sm text-white outline-none focus:border-yellow-500/50 transition-colors appearance-none"
                        >
                          {DEFAULT_PROXIES.map(proxy => (
                            <option key={proxy.id} value={proxy.url}>{proxy.name} - {proxy.url}</option>
                          ))}
                        </select>
                        <p className="text-xs text-zinc-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Note: These are placeholder proxies. Edit the code to add your own solid proxies.
                        </p>
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder="http://username:password@ip:port"
                        value={customProxy}
                        onChange={(e) => setCustomProxy(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md p-3 text-sm text-white outline-none focus:border-yellow-500/50 transition-colors"
                      />
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Network Headers */}
            <section className="space-y-4">
              <h2 className="text-zinc-500 text-xs font-bold tracking-widest uppercase">
                Network Headers (Optional)
              </h2>
              
              <div className="space-y-3">
                <div className="bg-[#141414] border border-zinc-800 rounded-lg p-1 flex items-center focus-within:border-yellow-500/50 transition-colors">
                  <div className="pl-3 pr-2 text-zinc-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="User-Agent"
                    value={userAgent}
                    onChange={(e) => setUserAgent(e.target.value)}
                    className="w-full bg-transparent border-none outline-none p-2 text-sm text-white placeholder:text-zinc-600"
                  />
                </div>

                <div className="bg-[#141414] border border-zinc-800 rounded-lg p-1 flex items-center focus-within:border-yellow-500/50 transition-colors">
                  <div className="pl-3 pr-2 text-zinc-500 font-mono text-xs font-bold">
                    HTTP
                  </div>
                  <input
                    type="text"
                    placeholder="Referrer"
                    value={referer}
                    onChange={(e) => setReferer(e.target.value)}
                    className="w-full bg-transparent border-none outline-none p-2 text-sm text-white placeholder:text-zinc-600"
                  />
                </div>

                <div className="bg-[#141414] border border-zinc-800 rounded-lg p-1 flex items-center focus-within:border-yellow-500/50 transition-colors">
                  <div className="pl-3 pr-2 text-zinc-500">
                    <CookieIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="Cookie"
                    value={cookie}
                    onChange={(e) => setCookie(e.target.value)}
                    className="w-full bg-transparent border-none outline-none p-2 text-sm text-white placeholder:text-zinc-600"
                  />
                </div>

                <div className="bg-[#141414] border border-zinc-800 rounded-lg p-1 flex items-center focus-within:border-yellow-500/50 transition-colors opacity-50">
                  <div className="pl-3 pr-2 text-zinc-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="DRM License Key (Not fully supported in this demo)"
                    value={drmKey}
                    onChange={(e) => setDrmKey(e.target.value)}
                    className="w-full bg-transparent border-none outline-none p-2 text-sm text-white placeholder:text-zinc-600"
                    disabled
                  />
                </div>
              </div>
            </section>

          </div>
        </main>
      </div>
    </div>
  );
}
