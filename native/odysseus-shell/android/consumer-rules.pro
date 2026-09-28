# Capacitor instantiates OdysseusShellPlugin and invokes its annotated members
# via reflection. Keep them so app-level R8/minification cannot strip the
# native bridge out of release builds (which would surface as "not
# implemented" plugin calls with a successfully compiling app).
-keep class dev.odysseus.shell.OdysseusShellPlugin { *; }
-keepclasseswithmembernames class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
}
