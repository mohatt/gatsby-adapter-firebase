import { useMemo } from 'react'
import { getApp, initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  initializeAuth,
  inMemoryPersistence,
  prodErrorMap,
} from 'firebase/auth'
import { getFunctions } from 'firebase/functions'
import { useHttpsCallable } from 'react-firebase-hooks/functions'

const firebaseConfig = {
  apiKey: "AIzaSyDw_FUs8KnXYFgnKbf2Dq_0nB-NDmry3fE",
  authDomain: "gatsby-firebase-87451.firebaseapp.com",
  projectId: "gatsby-firebase-87451",
  storageBucket: "gatsby-firebase-87451.firebasestorage.app",
  messagingSenderId: "905974170145",
  appId: "1:905974170145:web:29f00cf5160b38f9635960"
}

export const useFirebase = () => {
  return useMemo(() => {
    let app
    try {
      // ccvv
      app = getApp()
    } catch {
      // Initialize Firebase
      app = initializeApp(firebaseConfig)
    }
    return app
  }, [])
}

export const useFirebaseAuth = () => {
  const app = useFirebase()
  return useMemo(() => {
    const isBrowser = typeof window !== 'undefined'
    return initializeAuth(app, {
      errorMap: prodErrorMap,
      persistence: [isBrowser ? browserLocalPersistence : inMemoryPersistence],
      popupRedirectResolver: isBrowser ? browserPopupRedirectResolver : undefined,
    })
  }, [app])
}

export const useFirebaseFunction = (name) => {
  const app = useFirebase()
  const functions = getFunctions(app)
  return useHttpsCallable(functions, name)
}
