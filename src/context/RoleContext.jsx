import { createContext, useContext } from 'react'

const RoleContext = createContext(null)

export function RoleProvider({ children, value }) {
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  return useContext(RoleContext) || {}
}
