package com.apexalgo.terminal;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            Intent svcIntent = new Intent(this, TradingForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(this, svcIntent);
            } else {
                startService(svcIntent);
            }
        } catch (Exception ignored) {}

        Window window = getWindow();
        if (window != null) {
            window.setStatusBarColor(Color.parseColor("#07090E"));
            window.setNavigationBarColor(Color.parseColor("#090D14"));

            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            if (controller != null) {
                controller.setAppearanceLightStatusBars(false);
                controller.setAppearanceLightNavigationBars(false);
            }

            View contentView = findViewById(android.R.id.content);
            if (contentView != null) {
                contentView.setBackgroundColor(Color.parseColor("#07090E"));
                ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                    Insets insets = windowInsets.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                    );
                    v.setPadding(insets.left, insets.top, insets.right, insets.bottom);
                    return WindowInsetsCompat.CONSUMED;
                });
            }
        }
    }
}
