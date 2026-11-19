!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$SMPROGRAMS\TimerOS.lnk" timeros_shortcut_done
  ClearErrors
  CreateShortCut "$SMPROGRAMS\TimerOS.lnk" "$INSTDIR\timeros.exe"
  IfErrors 0 timeros_shortcut_done
  DetailPrint "Could not create the TimerOS Start menu shortcut."
  timeros_shortcut_done:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$SMPROGRAMS\TimerOS.lnk"
!macroend
