import { Text, View, mount, signal } from 'nsh';
import { Button } from 'nsh/base';
import { T0Task } from 'hongguo-tv/native';

function App() {
  const active = signal(true);
  const events = signal<string[]>([]);
  return (
    <View class="flex-1 gap-4 p-5">
      <If when={active()}>
        <T0Task onComplete={() => events.update((items) => [...items, 'completed'])} />
      </If>
      <Button onPress={() => active.set(false)}>
        <Text>取消任务</Text>
      </Button>
      <Text>{events().join(',')}</Text>
    </View>
  );
}

mount(App);
