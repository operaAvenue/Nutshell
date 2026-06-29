export interface CustomThemeConfig {
  accent: string;
  mesh1: string;
  mesh2: string;
  mesh3: string;
  mesh4: string;
  glassOpacity: number;
  glowOpacity: number;
}

export const applyCustomTheme = (hex: string, isBlackTheme: boolean = false) => {
  if (hex === '#ffb703') isBlackTheme = true;
  const hexToRgb = (h: string) => {
    let r = 0, g = 0, b = 0;
    if (h.length === 4) {
      r = parseInt(h[1] + h[1], 16);
      g = parseInt(h[2] + h[2], 16);
      b = parseInt(h[3] + h[3], 16);
    } else if (h.length === 7) {
      r = parseInt(h[1] + h[2], 16);
      g = parseInt(h[3] + h[4], 16);
      b = parseInt(h[5] + h[6], 16);
    }
    return { r, g, b };
  };

  const adjustColor = (color: string, amount: number) => {
    return '#' + color.replace(/^#/, '').replace(/../g, c => ('0'+Math.min(255, Math.max(0, parseInt(c, 16) + amount)).toString(16)).slice(-2));
  };

  document.documentElement.className = 'theme-custom';
  document.documentElement.style.setProperty('--accent-400', adjustColor(hex, 40));
  document.documentElement.style.setProperty('--accent-500', hex);
  document.documentElement.style.setProperty('--accent-600', adjustColor(hex, -20));
  document.documentElement.style.setProperty('--accent-900', adjustColor(hex, -80));
  document.documentElement.style.setProperty('--accent-950', adjustColor(hex, -100));
  
  const rgb = hexToRgb(hex);
  if (rgb !== null) {
    document.documentElement.style.setProperty('--accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`);
    if (isBlackTheme) {
      document.documentElement.style.setProperty('--mesh-1', `#000000`);
      document.documentElement.style.setProperty('--mesh-2', `#050505`);
      document.documentElement.style.setProperty('--mesh-3', `#0a0a0a`);
      document.documentElement.style.setProperty('--mesh-4', `#030303`);
    } else {
      document.documentElement.style.setProperty('--mesh-1', `rgba(${Math.floor(rgb.r/8)}, ${Math.floor(rgb.g/8)}, ${Math.floor(rgb.b/8)}, 1)`);
      document.documentElement.style.setProperty('--mesh-2', `rgba(${Math.floor(rgb.r/5)}, ${Math.floor(rgb.g/5)}, ${Math.floor(rgb.b/5)}, 1)`);
      document.documentElement.style.setProperty('--mesh-3', `rgba(${Math.floor(rgb.r/4)}, ${Math.floor(rgb.g/4)}, ${Math.floor(rgb.b/4)}, 1)`);
      document.documentElement.style.setProperty('--mesh-4', `rgba(${Math.floor(rgb.r/6)}, ${Math.floor(rgb.g/6)}, ${Math.floor(rgb.b/6)}, 1)`);
    }
  }
  document.documentElement.style.setProperty('--glass-bg', `rgba(255, 255, 255, 0.08)`);
};

export const applyFullCustomTheme = (config: CustomThemeConfig) => {
  const hexToRgb = (h: string) => {
    let r = 0, g = 0, b = 0;
    if (h.length === 7) {
      r = parseInt(h[1] + h[2], 16);
      g = parseInt(h[3] + h[4], 16);
      b = parseInt(h[5] + h[6], 16);
    }
    return { r, g, b };
  };

  const adjustColor = (color: string, amount: number) => {
    return '#' + color.replace(/^#/, '').replace(/../g, c => ('0'+Math.min(255, Math.max(0, parseInt(c, 16) + amount)).toString(16)).slice(-2));
  };

  document.documentElement.className = 'theme-custom';
  document.documentElement.style.setProperty('--accent-400', adjustColor(config.accent, 40));
  document.documentElement.style.setProperty('--accent-500', config.accent);
  document.documentElement.style.setProperty('--accent-600', adjustColor(config.accent, -20));
  document.documentElement.style.setProperty('--accent-900', adjustColor(config.accent, -80));
  document.documentElement.style.setProperty('--accent-950', adjustColor(config.accent, -100));

  const rgb = hexToRgb(config.accent);
  document.documentElement.style.setProperty('--accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${config.glowOpacity})`);
  
  document.documentElement.style.setProperty('--mesh-1', config.mesh1);
  document.documentElement.style.setProperty('--mesh-2', config.mesh2);
  document.documentElement.style.setProperty('--mesh-3', config.mesh3);
  document.documentElement.style.setProperty('--mesh-4', config.mesh4);
  
  document.documentElement.style.setProperty('--glass-bg', `rgba(255, 255, 255, ${config.glassOpacity})`);
};

export const resetTheme = () => {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
};
