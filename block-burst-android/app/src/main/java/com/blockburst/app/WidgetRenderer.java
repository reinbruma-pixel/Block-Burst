package com.blockburst.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.text.NumberFormat;
import java.util.Locale;

/**
 * Draws the home-screen widget as one picture: rainbow crown and best score, the biome you are in, a line graph of
 * the score of every finished game (white dots mark new personal bests) and three small facts.
 * A single bitmap keeps the widget light and lets it use the same look as the game.
 */
final class WidgetRenderer {
    private static final int[] RAINBOW = {0xFFFF5D5D, 0xFFFF9A3D, 0xFFFFD83D, 0xFF5BE37D, 0xFF3EC6F0, 0xFF7A6BFF, 0xFFD36BF5};
    private static final long MAX_PIXELS = 1100000L; // RemoteViews bitmaps have a memory budget
    private static final Typeface BLACK = Typeface.create("sans-serif-black", Typeface.NORMAL);
    private static final Typeface BOLD = Typeface.create("sans-serif-medium", Typeface.BOLD);

    private WidgetRenderer() {}

    static Bitmap render(Context ctx, StatsStore.Stats s, int wDp, int hDp) {
        float density = ctx.getResources().getDisplayMetrics().density;
        int w = Math.max(40, Math.round(wDp * density));
        int h = Math.max(40, Math.round(hDp * density));
        float u = density; // pixels per dp
        long px = (long) w * (long) h;
        if (px > MAX_PIXELS) {
            float k = (float) Math.sqrt((double) MAX_PIXELS / (double) px);
            w = Math.max(40, Math.round(w * k));
            h = Math.max(40, Math.round(h * k));
            u = density * k;
        }
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        new Painter(new Canvas(bmp), s, w, h, u).draw();
        return bmp;
    }

    private static final class Painter {
        final Canvas cv;
        final StatsStore.Stats s;
        final float w, h, u;
        final int accent;
        final int surface;

        Painter(Canvas cv, StatsStore.Stats s, int w, int h, float u) {
            this.cv = cv;
            this.s = s;
            this.w = w;
            this.h = h;
            this.u = u;
            this.accent = brightest(s.c);
            this.surface = mix(mix(s.base[0], s.base[1], 0.5f), 0xFF0E0824, 0.62f);
        }

        void draw() {
            float radius = 22 * u;
            RectF all = new RectF(0, 0, w, h);
            Paint p = paint();
            p.setShader(new LinearGradient(0, 0, w, h, s.base[0], s.base[1], Shader.TileMode.CLAMP));
            cv.drawRoundRect(all, radius, radius, p);
            p.setShader(new RadialGradient(w * 0.95f, h * 0.05f, Math.max(w, h) * 0.8f,
                    alpha(s.c[0], 80), alpha(s.c[0], 0), Shader.TileMode.CLAMP));
            cv.drawRoundRect(all, radius, radius, p);
            p = paint();
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(Math.max(1f, u * 0.8f));
            p.setColor(0x1FFFFFFF);
            cv.drawRoundRect(new RectF(0.5f, 0.5f, w - 0.5f, h - 0.5f), radius, radius, p);

            float pad = 12 * u;
            boolean side = w / h > 2.3f;
            if (side) {
                float leftW = Math.min(w * 0.36f, 150 * u);
                float fs = clamp(h * 0.26f, 22 * u, 34 * u);
                drawHero(pad, pad, fs, leftW);
                float y = pad + fs * 1.25f;
                if (h > 90 * u) {
                    drawBiome(pad, y + 6 * u, leftW, false);
                    drawSmall(pad, y + 28 * u, formatCount(s.games) + (s.games == 1 ? " game" : " games"));
                }
                drawPlot(new RectF(pad + leftW + 10 * u, pad, w - pad, h - pad));
            } else {
                float fs = clamp(h * 0.2f, 20 * u, 32 * u);
                float heroW = drawHero(pad, pad, fs, w - 2 * pad);
                float nameRoom = w - 2 * pad - heroW - 12 * u;
                drawBiome(w - pad, pad + fs * 0.45f - 6 * u, nameRoom, true);
                boolean stats = h >= 175 * u;
                float statH = 38 * u;
                float top = pad + fs * 1.25f + 4 * u;
                float bottom = h - pad - (stats ? statH + 8 * u : 0);
                drawPlot(new RectF(pad, top, w - pad, bottom));
                if (stats) drawStats(pad, h - pad - statH, w - 2 * pad, statH);
            }
        }

        /** Crown plus the best score in rainbow. Returns the width used. */
        float drawHero(float x, float y, float fs, float maxW) {
            String text = formatFull(s.best);
            Paint t = paint();
            t.setTypeface(BLACK);
            t.setTextSize(fs);
            float ch = fs * 0.78f, cw = ch * 32f / 26f, gap = fs * 0.28f;
            float tw = t.measureText(text);
            if (cw + gap + tw > maxW && maxW > 0) {
                float k = maxW / (cw + gap + tw);
                fs *= k; ch *= k; cw *= k; gap *= k;
                t.setTextSize(fs);
                tw = t.measureText(text);
            }
            drawCrown(x, y + fs * 0.1f, cw, ch);
            float tx = x + cw + gap;
            float baseline = y + fs * 0.9f;
            t.setShader(new LinearGradient(tx, 0, tx + Math.max(1f, tw), 0, RAINBOW, null, Shader.TileMode.CLAMP));
            cv.drawText(text, tx, baseline, t);
            return cw + gap + tw;
        }

        void drawCrown(float x, float y, float cw, float ch) {
            float sx = cw / 32f, sy = ch / 26f;
            Path pa = new Path();
            pa.moveTo(x + 3 * sx, y + 21 * sy);
            pa.lineTo(x + 1.5f * sx, y + 7 * sy);
            pa.lineTo(x + 9 * sx, y + 13.5f * sy);
            pa.lineTo(x + 16 * sx, y + 3 * sy);
            pa.lineTo(x + 23 * sx, y + 13.5f * sy);
            pa.lineTo(x + 30.5f * sx, y + 7 * sy);
            pa.lineTo(x + 29 * sx, y + 21 * sy);
            pa.close();
            Paint p = paint();
            p.setShader(new LinearGradient(x, 0, x + cw, 0, RAINBOW, null, Shader.TileMode.CLAMP));
            cv.drawPath(pa, p);
            cv.drawRoundRect(new RectF(x + 4 * sx, y + 22.5f * sy, x + 28 * sx, y + 25.1f * sy), 1.3f * sx, 1.3f * sx, p);
        }

        /** Three overlapping color dots and the biome name. rightAlign puts it against x instead of starting at x. */
        void drawBiome(float x, float y, float room, boolean rightAlign) {
            Paint t = paint();
            t.setTypeface(BOLD);
            t.setTextSize(11 * u);
            t.setColor(0xCCFFFFFF);
            float dotR = 4.5f * u, step = 6 * u, dotsW = dotR * 2 + step * 2, gap = 6 * u;
            float nameW = t.measureText(s.biomeName);
            float total = dotsW + gap + nameW;
            if (total > room) {
                float avail = room - dotsW - gap;
                if (avail < 30 * u) return;
                // shorten the name to what fits
                String n = s.biomeName;
                while (n.length() > 3 && t.measureText(n + "...") > avail) n = n.substring(0, n.length() - 1);
                drawBiomeParts(rightAlign ? x - (dotsW + gap + t.measureText(n + "...")) : x, y, n + "...", t, dotR, step, dotsW, gap);
                return;
            }
            drawBiomeParts(rightAlign ? x - total : x, y, s.biomeName, t, dotR, step, dotsW, gap);
        }

        void drawBiomeParts(float x, float y, String name, Paint t, float dotR, float step, float dotsW, float gap) {
            Paint d = paint();
            for (int i = 0; i < 3; i++) {
                float cx = x + dotR + i * step;
                d.setColor(s.base[1]);
                cv.drawCircle(cx, y + 6 * u, dotR + 1.5f * u, d);
                d.setColor(s.c[i]);
                cv.drawCircle(cx, y + 6 * u, dotR, d);
            }
            cv.drawText(name, x + dotsW + gap, y + 10 * u, t);
        }

        void drawSmall(float x, float y, String text) {
            Paint t = paint();
            t.setTypeface(BOLD);
            t.setTextSize(11 * u);
            t.setColor(0xB3FFFFFF);
            cv.drawText(text, x, y + 10 * u, t);
        }

        void drawPlot(RectF r) {
            if (r.height() < 28 * u || r.width() < 60 * u) return;
            Paint p = paint();
            p.setColor(0x9E0E0824);
            cv.drawRoundRect(r, 14 * u, 14 * u, p);

            int n = s.scores.length;
            if (n == 0) {
                Paint t = paint();
                t.setTypeface(BLACK);
                t.setTextAlign(Paint.Align.CENTER);
                t.setTextSize(14 * u);
                t.setColor(0xFFFFFFFF);
                float cx = r.centerX(), cy = r.centerY();
                if (r.height() > 52 * u) {
                    cv.drawText("No games yet", cx, cy - 2 * u, t);
                    t.setTypeface(BOLD);
                    t.setTextSize(11 * u);
                    t.setColor(0xB3FFFFFF);
                    cv.drawText("Tap to play your first game", cx, cy + 14 * u, t);
                } else {
                    t.setTextSize(12 * u);
                    cv.drawText("Tap to play", cx, cy + 4 * u, t);
                }
                return;
            }

            boolean roomy = r.height() > 90 * u;
            float left = r.left + 34 * u, right = r.right - 14 * u;
            float top = r.top + (roomy ? 22 * u : 12 * u), bottom = r.bottom - (roomy ? 18 * u : 10 * u);
            if (bottom - top < 16 * u) return;

            int max = 0;
            for (int i = 0; i < n; i++) if (s.scores[i] > max) max = s.scores[i];
            float scale = niceTop(max);

            // grid and axis labels
            Paint g = paint();
            g.setStyle(Paint.Style.STROKE);
            g.setStrokeWidth(Math.max(1f, u * 0.8f));
            g.setColor(0x1CFFFFFF);
            Paint lab = paint();
            lab.setTypeface(BOLD);
            lab.setTextSize(9.5f * u);
            lab.setColor(0x80FFFFFF);
            lab.setTextAlign(Paint.Align.RIGHT);
            for (int k = 0; k < 3; k++) {
                float v = scale * k / 2f;
                float y = bottom - (bottom - top) * v / scale;
                cv.drawLine(left, y, right, y, g);
                cv.drawText(axis(v), left - 6 * u, y + 3.4f * u, lab);
            }

            float[] xs = new float[n], ys = new float[n];
            for (int i = 0; i < n; i++) {
                xs[i] = n == 1 ? (left + right) / 2f : left + (right - left) * i / (n - 1f);
                ys[i] = bottom - (bottom - top) * s.scores[i] / scale;
            }

            if (n > 1) {
                Path line = new Path();
                line.moveTo(xs[0], ys[0]);
                for (int i = 1; i < n; i++) line.lineTo(xs[i], ys[i]);
                Path area = new Path(line);
                area.lineTo(xs[n - 1], bottom);
                area.lineTo(xs[0], bottom);
                area.close();
                Paint a = paint();
                a.setColor(alpha(accent, 32));
                cv.drawPath(area, a);
                Paint l = paint();
                l.setStyle(Paint.Style.STROKE);
                l.setStrokeWidth(2 * u);
                l.setStrokeJoin(Paint.Join.ROUND);
                l.setStrokeCap(Paint.Cap.ROUND);
                l.setColor(accent);
                cv.drawPath(line, l);
            }

            // white dots where a game beat everything before it
            if (n > 1 && (right - left) / (n - 1f) >= 11 * u) {
                int run = -1;
                Paint ring = paint();
                ring.setColor(surface);
                Paint dot = paint();
                dot.setColor(0xFFFFFFFF);
                for (int i = 0; i < n - 1; i++) {
                    if (s.scores[i] > run) {
                        run = s.scores[i];
                        cv.drawCircle(xs[i], ys[i], 5.2f * u, ring);
                        cv.drawCircle(xs[i], ys[i], 3.4f * u, dot);
                    }
                }
            }

            // latest game
            Paint ring = paint();
            ring.setColor(surface);
            Paint end = paint();
            end.setColor(accent);
            cv.drawCircle(xs[n - 1], ys[n - 1], 6.8f * u, ring);
            cv.drawCircle(xs[n - 1], ys[n - 1], 4.6f * u, end);

            // best (or only) value labelled above its point
            int bi = 0;
            for (int i = 0; i < n; i++) if (s.scores[i] == max) { bi = i; break; }
            Paint val = paint();
            val.setTypeface(BLACK);
            val.setTextSize(10.5f * u);
            val.setColor(0xFFFFFFFF);
            val.setTextAlign(Paint.Align.CENTER);
            String text = formatFull(max);
            float half = val.measureText(text) / 2f + 2 * u;
            float lx = Math.max(r.left + half, Math.min(r.right - half, xs[bi]));
            cv.drawText(text, lx, Math.max(r.top + 12 * u, ys[bi] - 10 * u), val);

            if (roomy) {
                int first = Math.max(1, s.games - n + 1);
                lab.setTextAlign(Paint.Align.LEFT);
                cv.drawText("Game " + first, left, r.bottom - 5 * u, lab);
                if (n > 1) {
                    lab.setTextAlign(Paint.Align.RIGHT);
                    cv.drawText("Game " + (first + n - 1), right, r.bottom - 5 * u, lab);
                }
            }
        }

        void drawStats(float x, float y, float width, float height) {
            int n = s.scores.length;
            int recent = Math.min(10, n);
            long sum = 0;
            for (int i = n - recent; i < n; i++) sum += s.scores[i];
            String last = n > 0 ? compact(s.scores[n - 1]) : (s.last > 0 ? compact(s.last) : "-");
            String avg = recent > 0 ? compact((int) Math.round(sum / (double) recent)) : "-";
            String[] values = {last, avg, compact(s.games)};
            String[] labels = {"Last game", recent >= 10 ? "Avg last 10" : "Average", "Games"};
            float gap = 8 * u, bw = (width - 2 * gap) / 3f;
            Paint box = paint();
            box.setColor(0x12FFFFFF);
            Paint v = paint();
            v.setTypeface(BLACK);
            v.setTextSize(15 * u);
            v.setColor(0xFFFFFFFF);
            Paint l = paint();
            l.setTypeface(BOLD);
            l.setTextSize(9.5f * u);
            l.setColor(0x80FFFFFF);
            for (int i = 0; i < 3; i++) {
                float bx = x + i * (bw + gap);
                cv.drawRoundRect(new RectF(bx, y, bx + bw, y + height), 12 * u, 12 * u, box);
                cv.drawText(values[i], bx + 10 * u, y + height * 0.52f, v);
                cv.drawText(labels[i], bx + 10 * u, y + height * 0.84f, l);
            }
        }

        // ------------------------------------------------------------ helpers
        static Paint paint() {
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setStyle(Paint.Style.FILL);
            return p;
        }

        static float clamp(float v, float a, float b) {
            return Math.max(a, Math.min(b, v));
        }

        static int alpha(int color, int a) {
            return (a << 24) | (color & 0x00FFFFFF);
        }

        static int mix(int a, int b, float t) {
            int ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
            int br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
            return 0xFF000000
                    | (Math.round(ar + (br - ar) * t) << 16)
                    | (Math.round(ag + (bg - ag) * t) << 8)
                    | Math.round(ab + (bb - ab) * t);
        }

        /** The lightest of the biome colors: it stays readable on the dark card. */
        static int brightest(int[] cols) {
            int best = cols[0];
            double bl = -1;
            for (int c : cols) {
                double l = 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
                if (l > bl) { bl = l; best = c; }
            }
            return best;
        }

        static float niceTop(int max) {
            if (max <= 0) return 100f;
            double mag = Math.pow(10, Math.floor(Math.log10(max)));
            double[] steps = {1, 2, 3, 4, 5, 6, 8, 10};
            for (double st : steps) if (st * mag >= max * 1.04) return (float) (st * mag);
            return (float) (10 * mag);
        }

        static String formatFull(int v) {
            return NumberFormat.getIntegerInstance(Locale.US).format(v);
        }

        static String formatCount(int v) {
            return formatFull(v);
        }

        /** 1,020 stays 1,020; 124,000 becomes 124K; 1,200,000 becomes 1.2M. */
        static String compact(int v) {
            if (v < 100000) return formatFull(v);
            if (v >= 1000000) {
                String m = String.format(Locale.US, v >= 10000000 ? "%.0f" : "%.1f", v / 1000000.0);
                return (m.endsWith(".0") ? m.substring(0, m.length() - 2) : m) + "M";
            }
            return Math.round(v / 1000.0) + "K";
        }

        static String axis(float v) {
            if (v >= 1000000f) {
                String m = String.format(Locale.US, "%.1f", v / 1000000f);
                return (m.endsWith(".0") ? m.substring(0, m.length() - 2) : m) + "M";
            }
            if (v >= 1000f) {
                String k = String.format(Locale.US, "%.1f", v / 1000f);
                return (k.endsWith(".0") ? k.substring(0, k.length() - 2) : k) + "K";
            }
            return String.valueOf(Math.round(v));
        }
    }
}
