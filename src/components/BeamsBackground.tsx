'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const Beams = dynamic(() => import('./Beams'), { 
  ssr: false,
  loading: () => null
})

export default function BeamsBackground() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="fixed inset-0 -z-10 bg-black" />
  }

  return (
    <div 
      className="fixed inset-0 pointer-events-none"
      style={{
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        position: 'fixed',
        overflow: 'hidden',
        backgroundColor: 'transparent'
      }}
    >
      <Beams
        beamWidth={3}
        beamHeight={30}
        beamNumber={20}
        lightColor="#ffffff"
        speed={2}
        noiseIntensity={1.75}
        scale={0.2}
        rotation={30}
      />
    </div>
  )
}

