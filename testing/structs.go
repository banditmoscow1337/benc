package testing

import "time"

//benc:generate
type ComplexData struct {
	Id                int64
	Id8               int8
	Id16              int16
	Title             string
	Items             []SubItem
	Metadata          map[string]int32
	Sub_data          SubComplexData
	Large_binary_data [][]byte
	Huge_list         []int64
	Inteface          any
	SliceOfInterfaces []any
	MapOfInterfaces   map[string]any
}

type SubComplexData struct {
	Sub_id             int32
	Sub_id8            uint8
	Sub_id16           uint16
	Sub_id32           uint32
	Sub_id64           uint64
	Sub_title          string
	Sub_binary_data    [][]byte
	Sub_items          []SubItem
	Sub_items_pointers []*SubItem
	Pointer_Sub_items  *[]SubItem
	Sub_metadata       map[string]string
}

type SubItem struct {
	Sub_id      int32
	Description string
	Sub_items   []SubSubItem
}

type SubSubItem struct {
	Sub_sub_id   string
	Sub_sub_data []byte
	Timestamp    time.Time
	Timestamps   map[string]*time.Time
}
