class Node:
    def __init__(self, data, unique_id):
        self.data = data
        self.unique_id = unique_id
        self.tombstone = False
        self.next = None

class LinkedList:
    def __init__(self):
        self.head = None
        self.tail = None

    def is_empty(self):
        return self.head is None

    def find_node(self, unique_id):
        current = self.head
        while current is not None:
            if current.unique_id == unique_id:
                return current
            current = current.next
        return None

    def insert(self, data, unique_id, after_id=None):
        new_node = Node(data, unique_id)

        if self.is_empty():
            self.head = new_node
        elif after_id == "head":
                new_node.next = self.head
                self.head = new_node
        else:
                after_node = self.find_node(after_id)
                if after_node is None:
                    print(f"Node with ID {after_id} not found.")
                else:
                    new_node.next = after_node.next
                    after_node.next = new_node


    def mark_for_deletion(self, unique_id):
        node = self.find_node(unique_id)
        if node:
            node.tombstone = True
        else:
            print(f"Node with ID {unique_id} not found.")

    def display(self):
        current = self.head
        while current:
            if not current.tombstone:
                print(f"Unique ID: {current.unique_id}, Data: {current.data}, Tombstone: {current.tombstone}")
            current = current.next
