/* ========================================
   FilmRecipes.js — 胶片配方引擎 v3
   核心算法：RGB曲线 + 亮度域Tone Mapping + Gamma + 胶片颗粒
   模拟真实胶片：Kodak Portra / Kodak Gold / Classic Chrome / Polaroid
   原则：保留宠物五官毛发细节，拒绝高对比/高饱和/强色偏
   ======================================== */

const FilmRecipes = {

    definitions: [
        {
            id: 'pawClassic',
            name: 'Paw Classic',
            nameCn: '日常陪伴',
            description: '柔和自然·家庭相册质感',
            swatchColors: ['#FFF6E6', '#FFC97A', '#D4A867'],
            film: {
                /* —— RGB 曲线控制点 [输入, 输出] 0-255 —— */
                /* R: 阴影略低(暖暗部)，高光略压 */
                curveR: [[0,8],[51,52],[102,100],[153,150],[204,200],[255,248]],
                /* G: 中性，高光轻微压低 */
                curveG: [[0,10],[51,54],[102,102],[153,152],[204,198],[255,246]],
                /* B: 阴影略高(冷暗部)，高光压低(暖高光) */
                curveB: [[0,12],[51,56],[102,104],[153,148],[204,194],[255,242]],
                /* —— 逐通道 Gamma（>1 提亮，<1 压暗）—— */
                gammaR: 1.03, gammaG: 1.0, gammaB: 0.97,
                /* —— 亮度域 Tone Mapping —— */
                highlightCompression: 0.06,
                shadowLift: 0.02,
                /* —— 整体调色 —— */
                saturation: 0.80,
                warmth: 0.04,
                fadeBlack: 0.015,
                fadeWhite: 0.02,
                /* —— 胶片颗粒 —— */
                grainIntensity: 0.06,
                grainShadowBoost: 1.2,
                grainSeed: 42,
                /* —— 画面效果 —— */
                vignette: 0.05,
                lightLeak: 0,
                dust: 0
            }
        },
        {
            id: 'firstDay',
            name: 'First Day',
            nameCn: '第一次见面',
            description: '暖金色调·十年前的旧照片',
            swatchColors: ['#FFEBC9', '#F5D6A1', '#C49A6C'],
            film: {
                /* R 明显提亮 → 金色暖调 */
                curveR: [[0,12],[51,58],[102,106],[153,154],[204,202],[255,250]],
                /* G 中性偏暖 */
                curveG: [[0,10],[51,52],[102,98],[153,148],[204,196],[255,244]],
                /* B 明显压低 → 减蓝增暖 */
                curveB: [[0,8],[51,46],[102,90],[153,136],[204,186],[255,234]],
                gammaR: 1.06, gammaG: 1.0, gammaB: 0.94,
                highlightCompression: 0.05,
                shadowLift: 0.04,
                saturation: 0.85,
                warmth: 0.08,
                fadeBlack: 0.02,
                fadeWhite: 0.02,
                grainIntensity: 0.07,
                grainShadowBoost: 1.3,
                grainSeed: 67,
                vignette: 0.08,
                lightLeak: 0.12,
                dust: 0.04
            }
        },
        {
            id: 'sunnyAfternoon',
            name: 'Sunny Afternoon',
            nameCn: '午后阳光',
            description: '日系柔光·Portra风',
            swatchColors: ['#FFFBF2', '#FFEED5', '#FFC97A'],
            film: {
                /* 三通道阴影均提亮 → 空气感、通透 */
                curveR: [[0,16],[51,62],[102,104],[153,152],[204,198],[255,250]],
                curveG: [[0,18],[51,64],[102,106],[153,154],[204,200],[255,250]],
                curveB: [[0,18],[51,64],[102,106],[153,152],[204,196],[255,248]],
                gammaR: 1.02, gammaG: 1.0, gammaB: 0.98,
                highlightCompression: 0.08,
                shadowLift: 0.05,
                saturation: 0.88,
                warmth: 0.03,
                fadeBlack: 0.025,
                fadeWhite: 0.015,
                grainIntensity: 0.04,
                grainShadowBoost: 1.1,
                grainSeed: 89,
                vignette: 0.03,
                lightLeak: 0.06,
                dust: 0
            }
        },
        {
            id: 'cozyHome',
            name: 'Cozy Home',
            nameCn: '宅家温暖',
            description: 'Polaroid即时显影·暖高光冷暗部',
            swatchColors: ['#FFE4A8', '#FFB876', '#E89B5C'],
            film: {
                /* R 高光提亮 → 暖高光；B 阴影提亮 → 冷暗部（Polaroid特征） */
                curveR: [[0,14],[51,56],[102,102],[153,152],[204,204],[255,252]],
                curveG: [[0,16],[51,58],[102,100],[153,148],[204,198],[255,248]],
                curveB: [[0,20],[51,62],[102,100],[153,142],[204,188],[255,242]],
                gammaR: 1.04, gammaG: 1.0, gammaB: 0.96,
                highlightCompression: 0.06,
                shadowLift: 0.04,
                saturation: 0.82,
                warmth: 0.06,
                fadeBlack: 0.03,
                fadeWhite: 0.02,
                grainIntensity: 0.08,
                grainShadowBoost: 1.4,
                grainSeed: 123,
                vignette: 0.06,
                lightLeak: 0.08,
                dust: 0
            }
        },
        {
            id: 'oldMemory',
            name: 'Old Memory',
            nameCn: '多年以后',
            description: '过期胶片·褪色温暖',
            swatchColors: ['#F5D6A1', '#D4A867', '#A87B4E'],
            film: {
                /* 所有通道黑场大幅提亮 → 褪色 */
                curveR: [[0,26],[51,66],[102,106],[153,150],[204,196],[255,250]],
                curveG: [[0,24],[51,62],[102,102],[153,148],[204,194],[255,248]],
                curveB: [[0,22],[51,60],[102,100],[153,142],[204,188],[255,244]],
                gammaR: 1.07, gammaG: 1.0, gammaB: 0.93,
                highlightCompression: 0.04,
                shadowLift: 0.06,
                saturation: 0.72,
                warmth: 0.10,
                fadeBlack: 0.05,
                fadeWhite: 0.04,
                grainIntensity: 0.12,
                grainShadowBoost: 1.5,
                grainSeed: 256,
                vignette: 0.10,
                lightLeak: 0.05,
                dust: 0.06
            }
        }
    ],

    /* ===== 工具函数 ===== */

    imageToCanvas(img, maxSize, cropData) {
        let w, h;
        if (cropData && cropData.croppedCanvas) {
            w = cropData.croppedCanvas.width;
            h = cropData.croppedCanvas.height;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(cropData.croppedCanvas, 0, 0);
            if (maxSize && (w > maxSize || h > maxSize)) {
                const scale = maxSize / Math.max(w, h);
                const nw = Math.round(w * scale);
                const nh = Math.round(h * scale);
                const tc = document.createElement('canvas');
                tc.width = nw;
                tc.height = nh;
                tc.getContext('2d').drawImage(canvas, 0, 0, nw, nh);
                return { canvas: tc, ctx: tc.getContext('2d'), imageData: tc.getContext('2d').getImageData(0, 0, nw, nh) };
            }
            return { canvas, ctx, imageData: ctx.getImageData(0, 0, w, h) };
        }

        w = img.naturalWidth || img.width;
        h = img.naturalHeight || img.height;

        if (maxSize && (w > maxSize || h > maxSize)) {
            const scale = maxSize / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        return { canvas, ctx, imageData: ctx.getImageData(0, 0, w, h) };
    },

    clamp(v, min, max) {
        return v < min ? min : (v > max ? max : v);
    },

    seededRandom(seed) {
        let s = seed;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    },

    /* ===== LUT 构建 ===== */

    /**
     * 从控制点构建 256 级查找表
     * 使用 smoothstep 插值，曲线平滑无锯齿
     */
    buildLUT(points) {
        const lut = new Uint8Array(256);
        const pts = points.slice().sort((a, b) => a[0] - b[0]);

        for (let i = 0; i < 256; i++) {
            // 定位所在区段
            let seg = 0;
            while (seg < pts.length - 2 && i >= pts[seg + 1][0]) seg++;

            const x0 = pts[seg][0], y0 = pts[seg][1];
            const x1 = pts[seg + 1][0], y1 = pts[seg + 1][1];

            let t = x1 > x0 ? (i - x0) / (x1 - x0) : 0;
            t = this.clamp(t, 0, 1);
            // smoothstep — S曲线过渡，比线性插值更自然
            const ts = t * t * (3 - 2 * t);
            lut[i] = Math.round(y0 + ts * (y1 - y0));
        }
        return lut;
    },

    /**
     * 合并 RGB曲线 + Gamma 为单一查找表
     * 减少逐像素计算量
     */
    buildCombinedLUT(curvePoints, gamma) {
        const curveLUT = this.buildLUT(curvePoints);
        const lut = new Uint8Array(256);
        const invGamma = 1.0 / gamma;
        for (let i = 0; i < 256; i++) {
            const v = curveLUT[i] / 255;
            const gv = Math.pow(v, invGamma);
            lut[i] = Math.round(this.clamp(gv * 255, 0, 255));
        }
        return lut;
    },

    /* ===== 核心像素处理 ===== */

    /**
     * 逐像素胶片处理管线：
     * 1. RGB曲线 + Gamma（LUT查找）
     * 2. 亮度域Tone Mapping（高光压缩 + 阴影提升，保持色彩关系）
     * 3. 暖色偏移
     * 4. 饱和度调整（亮度域混合）
     * 5. 褪色（黑场提升 + 白场压缩）
     * 6. 胶片颗粒（单色、亮度相关、高斯分布）
     */
    applyFilmProcessing(imageData, f, lutR, lutG, lutB) {
        const data = imageData.data;
        const len = data.length;

        const sat = f.saturation !== undefined ? f.saturation : 1.0;
        const warmth = f.warmth || 0;
        const warmthR = warmth * 0.3;
        const warmthG = warmth * 0.05;
        const warmthB = warmth * 0.3;
        const fadeB = f.fadeBlack || 0;
        const fadeW = f.fadeWhite || 0;
        const fadeScale = 1 - fadeW;

        const hlCompress = f.highlightCompression || 0;
        const shLift = f.shadowLift || 0;

        const grainI = f.grainIntensity || 0;
        const grainSB = f.grainShadowBoost || 1.0;
        const rand = this.seededRandom(f.grainSeed || 42);

        for (let i = 0; i < len; i += 4) {
            /* —— 1. RGB曲线 + Gamma（合并LUT）—— */
            let r = lutR[data[i]];
            let g = lutG[data[i + 1]];
            let b = lutB[data[i + 2]];

            let rf = r / 255;
            let gf = g / 255;
            let bf = b / 255;

            /* —— 2. 亮度域 Tone Mapping —— */
            if (hlCompress > 0 || shLift > 0) {
                const lum = 0.2126 * rf + 0.7152 * gf + 0.0722 * bf;

                // 高光压缩：soft knee，亮度>0.6开始压
                if (hlCompress > 0 && lum > 0.6) {
                    const t = (lum - 0.6) / 0.4;
                    const compress = 1 - hlCompress * t * t;
                    rf *= compress;
                    gf *= compress;
                    bf *= compress;
                }

                // 阴影提升：亮度<0.4开始提
                if (shLift > 0 && lum < 0.4) {
                    const t = (0.4 - lum) / 0.4;
                    const lift = shLift * t;
                    rf += lift;
                    gf += lift;
                    bf += lift;
                }
            }

            /* —— 3. 暖色偏移 —— */
            if (warmth !== 0) {
                rf += warmthR;
                gf += warmthG;
                bf -= warmthB;
            }

            /* —— 4. 饱和度（亮度域混合，保护色调）—— */
            if (sat < 1.0) {
                const lum = 0.2126 * rf + 0.7152 * gf + 0.0722 * bf;
                rf = lum + (rf - lum) * sat;
                gf = lum + (gf - lum) * sat;
                bf = lum + (bf - lum) * sat;
            }

            /* —— 5. 褪色（黑场提升 + 白场压缩）—— */
            if (fadeB > 0 || fadeW > 0) {
                rf = rf * fadeScale + fadeB;
                gf = gf * fadeScale + fadeB;
                bf = bf * fadeScale + fadeB;
            }

            /* —— 6. 胶片颗粒 —— */
            if (grainI > 0) {
                // 当前亮度（Rec.601 更接近人眼感知）
                const lum = 0.299 * rf + 0.587 * gf + 0.114 * bf;
                // 暗部颗粒增强
                const shadowFactor = 1 + (1 - lum) * (grainSB - 1);
                // 高斯分布噪声（3次均匀随机求和近似）
                const noise = ((rand() + rand() + rand()) / 3 - 0.5) * 2;
                const grainAmount = noise * grainI * 120 * shadowFactor / 255;
                rf += grainAmount;
                gf += grainAmount;
                bf += grainAmount;
            }

            /* —— 写回 —— */
            data[i]     = this.clamp(rf * 255 + 0.5, 0, 255);
            data[i + 1] = this.clamp(gf * 255 + 0.5, 0, 255);
            data[i + 2] = this.clamp(bf * 255 + 0.5, 0, 255);
        }
    },

    /* ===== 画面级效果 ===== */

    /**
     * 暖色暗角 — 模拟胶片边缘减光
     */
    addVignette(ctx, w, h, intensity) {
        if (intensity <= 0) return;
        const gradient = ctx.createRadialGradient(
            w / 2, h / 2, Math.min(w, h) * 0.35,
            w / 2, h / 2, Math.max(w, h) * 0.75
        );
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.6, 'rgba(80,50,20,' + (intensity * 0.12) + ')');
        gradient.addColorStop(1, 'rgba(50,30,10,' + (intensity * 0.4) + ')');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
    },

    /**
     * 漏光 — 模拟胶片背面漏光，暖色调
     */
    addLightLeak(ctx, w, h, intensity, seed) {
        if (intensity <= 0) return;
        const rand = this.seededRandom(seed || 99);
        const corner = Math.floor(rand() * 4);
        const corners = [[0, 0], [w, 0], [0, h], [w, h]];
        const [cx, cy] = corners[corner];

        const gradient = ctx.createRadialGradient(
            cx, cy, 0,
            cx, cy, Math.max(w, h) * 0.65
        );
        gradient.addColorStop(0, 'rgba(255,210,140,' + (intensity * 0.35) + ')');
        gradient.addColorStop(0.3, 'rgba(255,180,100,' + (intensity * 0.18) + ')');
        gradient.addColorStop(0.7, 'rgba(255,160,70,' + (intensity * 0.06) + ')');
        gradient.addColorStop(1, 'rgba(255,140,40,0)');

        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
    },

    /**
     * 灰尘颗粒 — 模拟旧底片灰尘
     */
    addDust(ctx, w, h, intensity, seed) {
        if (intensity <= 0) return;
        const rand = this.seededRandom(seed || 77);
        const count = Math.floor(intensity * w * h / 1500);

        ctx.globalCompositeOperation = 'multiply';
        for (let i = 0; i < count; i++) {
            const x = rand() * w;
            const y = rand() * h;
            const size = rand() * 1.5 + 0.5;
            const opacity = rand() * 0.2 + 0.06;
            ctx.fillStyle = 'rgba(90,70,40,' + opacity + ')';
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
    },

    /* ===== 主入口 ===== */

    process(source, recipeId, maxSize, cropData) {
        const recipe = this.definitions.find(r => r.id === recipeId);
        if (!recipe) return null;

        const { canvas, ctx, imageData } = this.imageToCanvas(source, maxSize || 800, cropData);
        const f = recipe.film;
        const w = canvas.width;
        const h = canvas.height;

        /* 构建合并查找表（曲线+Gamma → 单一LUT，减少逐像素计算） */
        const lutR = this.buildCombinedLUT(f.curveR, f.gammaR);
        const lutG = this.buildCombinedLUT(f.curveG, f.gammaG);
        const lutB = this.buildCombinedLUT(f.curveB, f.gammaB);

        /* 逐像素处理 */
        this.applyFilmProcessing(imageData, f, lutR, lutG, lutB);
        ctx.putImageData(imageData, 0, 0);

        /* 画面级效果 */
        if (f.lightLeak > 0) this.addLightLeak(ctx, w, h, f.lightLeak, recipe.id.charCodeAt(1) || 50);
        if (f.dust > 0) this.addDust(ctx, w, h, f.dust, recipe.id.charCodeAt(2) || 80);
        if (f.vignette > 0) this.addVignette(ctx, w, h, f.vignette);

        return canvas;
    },

    getSwatchStyle(recipe) {
        const c = recipe.swatchColors;
        return 'linear-gradient(135deg, ' + c[0] + ' 0%, ' + c[1] + ' 50%, ' + c[2] + ' 100%)';
    }
};
