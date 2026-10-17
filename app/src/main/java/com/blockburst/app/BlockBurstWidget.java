package com.blockburst.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.widget.RemoteViews;

/** Home-screen widget: crown, best score, biome and a progress graph of every finished game. Tap to play. */
public class BlockBurstWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) update(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        update(context, manager, appWidgetId);
    }

    /** Redraws every Block Burst widget on the home screen (called whenever the game saves new numbers). */
    public static void refreshAll(Context context) {
        try {
            Context app = context.getApplicationContext();
            AppWidgetManager manager = AppWidgetManager.getInstance(app);
            int[] ids = manager.getAppWidgetIds(new ComponentName(app, BlockBurstWidget.class));
            for (int id : ids) update(app, manager, id);
        } catch (Exception ignored) {
            // the widget is a bonus; never let it take the game down
        }
    }

    private static void update(Context context, AppWidgetManager manager, int id) {
        try {
            Bundle o = manager.getAppWidgetOptions(id);
            boolean land = context.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
            int wDp = o.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
            int hDp = o.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 120);
            if (wDp <= 0) wDp = 250;
            if (hDp <= 0) hDp = 120;

            Bitmap bmp = WidgetRenderer.render(context, StatsStore.load(context), wDp, hDp);
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_block_burst);
            views.setImageViewBitmap(R.id.widget_img, bmp);

            Intent open = new Intent(context, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pi);

            manager.updateAppWidget(id, views);
        } catch (Exception ignored) {
            // keep whatever the widget showed before
        }
    }
}
