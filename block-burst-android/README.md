# Block Burst for Android

The game (in `app/src/main/assets/www`) wrapped in a full-screen WebView, plus a **home-screen widget** that shows
your crown, best score, current biome and a progress graph of every finished game.

## Build the APK (Android Studio)

1. Install Android Studio (Koala or newer). It brings its own JDK 17.
2. **File > Open** and choose this folder. Let Gradle sync (needs internet the first time).
3. Plug in a phone with USB debugging on (or start an emulator) and press **Run**.
   For a file to share: **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The debug APK lands in `app/build/outputs/apk/debug/`.

Command line, if you have Gradle 8.7+ and the Android SDK: `gradle assembleDebug`.

## Build the APK on GitHub (no Android Studio)

1. Put this whole folder in a GitHub repository (VS Code: Source Control > Publish to GitHub, or `git push`).
2. Open the repository on github.com, click **Actions**, then **Build APK**. It also starts by itself on every push.
   To start it by hand: **Run workflow**, pick your branch.
3. When the run turns green, open it and download **block-burst-apk** under *Artifacts*. Unzip it and install the `.apk`
   (allow "install unknown apps" on the phone). It is a debug build, fine for your own devices.
4. If the run turns red, open the failed step and read the red lines at the bottom. Send them to me and I will fix it.

## Add the widget

Long-press the home screen, choose **Widgets**, find **Block Burst**, drag **Block Burst progress** onto the screen.
Resize it: small shows the best score and a short graph, taller adds Last game / Average / Games. Tap it to play.
It updates every time the game saves a score. Play one game (until Game Over) and the graph starts.

## Change the game

Edit `index.html`, `style.css`, `script.js` in your own folder, then run `./sync-web.sh /path/to/folder`
(or copy the three files into `app/src/main/assets/www`) and rebuild.

## How the pieces fit

- `MainActivity.java`: full-screen WebView, serves the game from `https://appassets.androidplatform.net/assets/www/`,
  opens the system picker for the photo and music buttons, pauses music in the background, Back closes Settings first.
- `StatsStore.java`: keeps the numbers the game sends (`window.BlockBurstNative.saveStats(json)`).
- `BlockBurstWidget.java` and `WidgetRenderer.java`: draw the widget picture at the size you drag it to.
- Fonts (Lilita One, Nunito) come from Google Fonts when the phone is online; offline the game uses the system font.
