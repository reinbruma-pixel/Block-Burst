package com.blockburst.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The numbers the game saves for the widget. The game sends the same JSON it keeps in localStorage:
 * { best, last, games, history: [{s, t}], biome: { name, c: [4 colors], base: [2 colors] } }
 */
final class StatsStore {
    private static final String PREFS = "blockburst";
    private static final String KEY = "stats";

    static final class Stats {
        int best, last, games;
        int[] scores = new int[0];
        long[] times = new long[0];
        String biomeName = "Cosmic Nebula";
        int[] c = {0xFF8F5BFF, 0xFFFF4FD8, 0xFF3EC6F0, 0xFF4F6BFF};
        int[] base = {0xFF0B0724, 0xFF2A0F5E};
    }

    private StatsStore() {}

    static void save(Context ctx, String json) {
        if (json == null || json.length() > 200000) return;
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
    }

    static Stats load(Context ctx) {
        Stats s = new Stats();
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = p.getString(KEY, null);
        if (raw == null) return s;
        try {
            JSONObject o = new JSONObject(raw);
            s.best = o.optInt("best", 0);
            s.last = o.optInt("last", 0);
            s.games = o.optInt("games", 0);
            JSONArray h = o.optJSONArray("history");
            if (h != null) {
                int n = h.length();
                s.scores = new int[n];
                s.times = new long[n];
                for (int i = 0; i < n; i++) {
                    JSONObject e = h.optJSONObject(i);
                    if (e == null) continue;
                    s.scores[i] = e.optInt("s", 0);
                    s.times[i] = e.optLong("t", 0L);
                    if (s.scores[i] > s.best) s.best = s.scores[i];
                }
                if (s.games < n) s.games = n;
            }
            JSONObject b = o.optJSONObject("biome");
            if (b != null) {
                s.biomeName = b.optString("name", s.biomeName);
                int[] c = colors(b.optJSONArray("c"), 4);
                int[] base = colors(b.optJSONArray("base"), 2);
                if (c != null) s.c = c;
                if (base != null) s.base = base;
            }
        } catch (Exception ignored) {
            // a damaged value just shows the empty widget
        }
        return s;
    }

    private static int[] colors(JSONArray a, int want) {
        if (a == null || a.length() < want) return null;
        int[] out = new int[want];
        try {
            for (int i = 0; i < want; i++) {
                String hex = a.getString(i);
                out[i] = 0xFF000000 | Integer.parseInt(hex.substring(1), 16);
            }
        } catch (Exception e) {
            return null;
        }
        return out;
    }
}
