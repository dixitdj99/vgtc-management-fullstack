import React, { useEffect, useRef } from 'react';
import './CinematicWeather.css';

// --- PARTICLE CLASS ---
class Particle {
    constructor(ctx, type, width, height) {
        this.ctx = ctx;
        this.type = type;
        this.w = width;
        this.h = height;
        this.reset();
    }

    reset() {
        this.x = Math.random() * this.w;
        this.y = Math.random() * -this.h;
        this.z = Math.random() * 0.5 + 0.5; // Depth factor
        this.speed = (Math.random() * 5 + 10) * this.z;
        this.opacity = Math.random() * 0.5 + 0.2;
        this.size = this.type === 'snow' || this.type === 'blizzard' ? Math.random() * 3 + 1 : Math.random() * 1.5 + 0.5;
        this.velX = 0;
        
        if (this.type === 'blizzard') {
            this.velX = - (Math.random() * 15 + 20);
            this.speed = Math.random() * 4 + 6;
            this.x = Math.random() * this.w * 2;
        }

        if (this.type === 'leaves') {
            this.size = Math.random() * 6 + 4;
            this.velX = (Math.random() * 10 + 5);
            this.speed = Math.random() * 2 + 1;
            this.opacity = Math.random() * 0.3 + 0.1;
            this.color = Math.random() > 0.5 ? '#854d0e' : '#394622'; 
            this.x = -50;
        }

        if (this.type === 'stars') {
            this.size = Math.random() * 1.5;
            this.speed = 0;
            this.opacity = Math.random() * 0.8 + 0.2;
            this.y = Math.random() * this.h;
        }
    }

    update() {
        if (this.type === 'stars') {
            this.opacity = Math.sin(Date.now() * 0.001 * this.size + this.x) * 0.4 + 0.6;
            return;
        }

        this.y += this.speed;
        this.x += this.velX;

        if (this.type === 'snow' || this.type === 'blizzard') {
            this.x += Math.sin(this.y * 0.03) * 1;
        }

        if (this.type === 'leaves') {
            this.y += Math.sin(this.x * 0.02) * 2;
        }

        if (this.y > this.h + 20 || this.x < -100 || this.x > this.w + 100) {
            this.reset();
        }
    }

    draw() {
        this.ctx.beginPath();
        
        if (['rain', 'thunderstorm', 'heavy_rain', 'light_rain'].includes(this.type)) {
            this.ctx.strokeStyle = `rgba(167, 220, 255, ${this.opacity * 0.6})`;
            this.ctx.lineWidth = 1 * this.z;
            this.ctx.moveTo(this.x, this.y);
            this.ctx.lineTo(this.x - (this.velX * 0.1), this.y + 18 * this.z);
            this.ctx.stroke();
        } else if (this.type === 'leaves') {
            this.ctx.fillStyle = this.color;
            this.ctx.globalAlpha = this.opacity;
            this.ctx.ellipse(this.x, this.y, this.size, this.size/2, Math.PI/4, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
        } else {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
            this.ctx.arc(this.x, this.y, this.size * this.z, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
}

const mapWCodeToState = (code, isDay) => {
    if (!code) return isDay ? 'clear_day' : 'clear_night';
    
    if (code === 1000) return isDay ? 'clear_day' : 'clear_night';
    if ([1003, 1006].includes(code)) return 'partly_cloudy';
    if (code === 1009) return 'overcast';
    if ([1063, 1180, 1183, 1240].includes(code)) return 'light_rain';
    if ([1186, 1189, 1192, 1195, 1243, 1246].includes(code)) return 'heavy_rain';
    if ([1087, 1273, 1276].includes(code)) return 'thunderstorm';
    if ([1066, 1210, 1213, 1216, 1219, 1255].includes(code)) return 'snow';
    if ([1114, 1117, 1222, 1225, 1258].includes(code)) return 'blizzard';
    if ([1030, 1135, 1147].includes(code)) return 'mist';
    
    return isDay ? 'clear_day' : 'clear_night';
};

const CinematicWeather = ({ weatherCode, isDay }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const state = mapWCodeToState(weatherCode, isDay);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let particles = [];
        let animationFrameId;

        const resize = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            createParticles();
        };

        const createParticles = () => {
            particles = [];
            let count = 0;
            let pType = 'rain';

            if (state.includes('rain')) { count = 80; pType = 'rain'; }
            if (state === 'heavy_rain') { count = 150; pType = 'rain'; }
            if (state === 'thunderstorm') { count = 180; pType = 'rain'; }
            if (state === 'snow') { count = 100; pType = 'snow'; }
            if (state === 'blizzard') { count = 300; pType = 'blizzard'; }
            if (state === 'clear_night') { count = 80; pType = 'stars'; }
            if (state === 'windy') { count = 30; pType = 'leaves'; }

            for (let i = 0; i < count; i++) {
                particles.push(new Particle(ctx, pType, canvas.width, canvas.height));
            }
        };

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            animationFrameId = requestAnimationFrame(animate);
        };

        window.addEventListener('resize', resize);
        resize();
        animate();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [state]);

    return (
        <div ref={containerRef} className={`cinematic-weather state-${state}`}>
            <div className="weather-layer layer-bg"></div>
            
            <div className="weather-layer layer-celestial">
                {(state === 'clear_day' || state === 'partly_cloudy' || state === 'sunset') && <div className="sun"></div>}
                {(state === 'clear_night') && <div className="moon"></div>}
            </div>

            <div className="weather-layer layer-clouds"></div>

            <canvas ref={canvasRef} className="weather-layer layer-canvas"></canvas>

            <div className="weather-layer layer-atmosphere">
                {state === 'mist' && <div className="mist-wave"></div>}
            </div>
        </div>
    );
};

export default CinematicWeather;
