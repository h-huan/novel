export { dependencyContext as compileContext } from './dependency-context';
export type CompiledContext = ReturnType<typeof import('./dependency-context').dependencyContext>;
