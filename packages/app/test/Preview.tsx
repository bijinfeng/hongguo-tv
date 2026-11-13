import { Scroll, Text, View, signal, type InputRef } from 'nsh';
import {
  Button,
  Controls,
  Cover,
  Notice,
  PosterCard,
  Product,
  SearchInput,
  type ProductTarget,
} from '@hongguo/ui';

/** Internal controls fixture: never mounted by a product entry. */
export function ControlPreview(props: { target: ProductTarget }) {
  const value = signal('');
  const selected = signal(0);
  let input: InputRef | undefined;
  return (
    <Product.Provider value={props.target}>
      <Scroll class="flex-1 bg-background" contentStyle={{ padding: 24, gap: 24 }}>
        <View class="gap-5">
          <Text class="text-3xl font-semibold text-foreground">控件预览</Text>
          <Controls label="主导航预览">
            <Button label="首页" variant="navigation" selected onPress={() => selected.set(0)} />
            <Button label="找剧" variant="navigation" onPress={() => input?.focus()} />
          </Controls>
          <View class="flex-row gap-3">
            <SearchInput
              inputRef={(ref) => {
                input = ref;
              }}
              value={value()}
              onChange={value.set}
              onSubmit={() => selected.set(1)}
            />
            <Button
              label="搜索"
              primary
              disabled={!value().trim()}
              onPress={() => selected.set(1)}
            />
          </View>
          <Controls label="选集区间">
            <Button label="1–24" selected={selected() === 0} onPress={() => selected.set(0)} />
            <Button label="25–48" selected={selected() === 1} onPress={() => selected.set(1)} />
            <Button label="未开放" disabled onPress={() => {}} />
          </Controls>
          <View class="flex-row gap-4">
            <View class="w-40">
              <PosterCard
                testID="preview-poster"
                title="封面加载失败仍可阅读长标题"
                cover="http://127.0.0.1:1/missing.jpg"
                caption="48 集"
                onPress={() => selected.set(1)}
              />
            </View>
            <Cover title="无封面" class="w-24 h-36" />
          </View>
          <Notice message="正在找剧…" />
          <Notice error message="搜索失败，请稍后重试。" retry={() => selected.set(0)} />
        </View>
      </Scroll>
    </Product.Provider>
  );
}
