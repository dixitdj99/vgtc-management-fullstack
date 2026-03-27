/**
 * CINEMATIC WEATHER ENGINE
 * Physics-based, Layered, Performance-optimized
 */

const API_KEY = 'e98e8f62e87e49de8db164340262603';
const REFRESH_RATE = 10 * 60 * 1000;

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
            this.color = Math.random() > 0.5 ? '#854d0e' : '#3f6212'; // Fall/Green colors
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
        
        if (this.type === 'rain' || this.type === 'thunderstorm' || this.type === 'heavy_rain') {
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

// --- WEATHER ENGINE ---
class WeatherEngine {
    constructor() {
        this.canvas = document.getElementById('weather-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.state = 'clear_day';
        this.isDay = true;
        this.currentTemp = 0;
        this.units = localStorage.getItem('weather_unit') || 'C';

        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.init();
    }

    resize() {
        this.w = this.canvas.width = this.canvas.offsetWidth;
        this.h = this.canvas.height = this.canvas.offsetHeight;
        this.createParticles();
    }

    async init() {
        this.animate();
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
        
        await this.detectLocation();
        setInterval(() => this.detectLocation(), REFRESH_RATE);
    }

    async detectLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => this.fetchWeatherData(`${pos.coords.latitude},${pos.coords.longitude}`),
                () => this.fetchWeatherData('auto:ip')
            );
        } else {
            this.fetchWeatherData('auto:ip');
        }
    }

    async fetchWeatherData(query) {
        try {
            const res = await fetch(`https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${query}&aqi=no`);
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            this.handleData(data);
        } catch (e) {
            console.error("Weather data fetch error:", e);
        }
    }

    handleData(data) {
        const { temp_c, is_day, condition } = data.current;
        this.isDay = is_day;
        this.currentTemp = temp_c;
        
        // UI Updates
        document.getElementById('location-name').innerText = `${data.location.name}, ${data.location.country}`;
        document.getElementById('weather-desc').innerText = condition.text;
        document.getElementById('weather-icon').src = `https:${condition.icon}`;
        
        this.updateTempUI();
        this.mapConditionToState(condition.code);
    }

    mapConditionToState(code) {
        let newState = 'clear_day';
        
        if (code === 1000) newState = this.isDay ? 'clear_day' : 'clear_night';
        else if ([1003, 1006].includes(code)) newState = 'partly_cloudy';
        else if (code === 1009) newState = 'overcast';
        else if ([1063, 1180, 1183, 1240].includes(code)) newState = 'light_rain';
        else if ([1186, 1189, 1192, 1195, 1243, 1246].includes(code)) newState = 'heavy_rain';
        else if ([1087, 1273, 1276].includes(code)) newState = 'thunderstorm';
        else if ([1066, 1210, 1213, 1216, 1219, 1255].includes(code)) newState = 'snow';
        else if ([1114, 1117, 1222, 1225, 1258].includes(code)) newState = 'blizzard';
        else if ([1030, 1135, 1147].includes(code)) newState = 'mist';

        this.setState(newState);
    }

    setState(newState) {
        if (this.state === newState) return;
        
        const header = document.getElementById('weather-header');
        header.className = `weather-header state-${newState}`;
        this.state = newState;
        
        // Celestial handling
        const celestial = document.getElementById('layer-celestial');
        celestial.innerHTML = '';
        if (newState.includes('clear') || newState === 'partly_cloudy' || newState === 'sunset') {
            const body = document.createElement('div');
            body.className = this.isDay ? 'sun' : 'moon';
            if (newState === 'sunset') body.style.bottom = '-40px'; 
            celestial.appendChild(body);
        }

        this.createParticles();
    }

    createParticles() {
        this.particles = [];
        let count = 0;
        let pType = 'rain';

        if (this.state.includes('rain')) count = 100;
        if (this.state === 'heavy_rain') count = 250;
        if (this.state === 'thunderstorm') { count = 300; pType = 'rain'; }
        if (this.state === 'snow') { count = 150; pType = 'snow'; }
        if (this.state === 'blizzard') { count = 500; pType = 'blizzard'; }
        if (this.state === 'clear_night') { count = 120; pType = 'stars'; }
        if (this.state === 'windy') { count = 40; pType = 'leaves'; }

        // Atmosphere layer cleanup/setup
        const atmos = document.getElementById('layer-atmosphere');
        atmos.innerHTML = '';
        if (this.state === 'mist') {
            const mist = document.createElement('div');
            mist.className = 'mist-wave';
            atmos.appendChild(mist);
        }

        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(this.ctx, pType, this.w, this.h));
        }
    }

    updateTempUI() {
        const valEl = document.getElementById('temp-val');
        const unitEl = document.getElementById('temp-unit');
        const container = document.getElementById('temp-display');
        
        const displayTemp = this.units === 'C' ? this.currentTemp : (this.currentTemp * 9/5) + 32;
        
        // Color shift
        container.className = 'temp-display ' + (this.currentTemp > 25 ? 'temp-hot' : 'temp-cold');
        
        // Pop effect
        valEl.classList.add('temp-pop');
        setTimeout(() => valEl.classList.remove('temp-pop'), 300);
        
        // Counter animation
        this.animateCounter(valEl, parseInt(valEl.innerText) || 0, Math.round(displayTemp), 800);
        unitEl.innerText = `°${this.units}`;
    }

    animateCounter(el, start, end, duration) {
        let startTime = null;
        const step = (now) => {
            if (!startTime) startTime = now;
            const progress = Math.min((now - startTime) / duration, 1);
            el.innerText = Math.floor(progress * (end - start) + start);
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    updateClock() {
        const now = new Date();
        document.getElementById('current-time').innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    animate() {
        this.ctx.clearRect(0, 0, this.w, this.h);
        
        this.particles.forEach(p => {
            p.update();
            p.draw();
        });
        
        requestAnimationFrame(() => this.animate());
    }
}

// --- GLOBAL APP LOGIC ---
let engine;
window.onload = () => {
    engine = new WeatherEngine();
};

function changeWeather(state) {
    engine.setState(state);
}

function toggleUnits() {
    engine.units = engine.units === 'C' ? 'F' : 'C';
    localStorage.setItem('weather_unit', engine.units);
    engine.updateTempUI();
}
